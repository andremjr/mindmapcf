import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import type { Project } from "@/lib/types";


interface Row {
  id: string;
  title: string;
  data: { nodes: Project["nodes"]; viewport?: Project["viewport"] };
  created_at: string;
  updated_at: string;
}

function toProject(r: Row): Project {
  return {
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    nodes: r.data?.nodes ?? [],
    viewport: r.data?.viewport ?? { x: 0, y: 0, zoom: 1 },
  };
}

/**
 * Hydrates the store from Supabase for the given user and keeps
 * every project change mirrored to the `mindmaps` table.
 * Mount once (top of the projects area) while a session exists.
 */
export function useMindmapSync(userId: string | undefined) {
  const hydrate = useStore((s) => s.hydrate);
  const reset = useStore((s) => s.reset);
  const readyRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  const prevRef = useRef<Map<string, Project>>(new Map());
  const knownIdsRef = useRef<Set<string>>(new Set());

  // Load once per user
  useEffect(() => {
    readyRef.current = false;
    setHydrated(false);
    if (!userId) {
      reset();
      prevRef.current = new Map();
      knownIdsRef.current = new Set();
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("mindmaps")
        .select("id, title, data, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (error) {
        console.error("[mindmapSync] load", error);
        setHydrated(true);
        return;
      }
      const projects = (data ?? []).map((r) => toProject(r as unknown as Row));
      hydrate(projects);
      prevRef.current = new Map(projects.map((p) => [p.id, p]));
      knownIdsRef.current = new Set(projects.map((p) => p.id));
      readyRef.current = true;
      setHydrated(true);
    })();
  }, [userId, hydrate, reset]);


  // Mirror store changes back to Supabase (debounced per project).
  useEffect(() => {
    if (!userId) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const unsub = useStore.subscribe((state) => {
      if (!readyRef.current) return;
      const prev = prevRef.current;
      const next = new Map(state.projects.map((p) => [p.id, p]));

      // Deletes
      for (const id of prev.keys()) {
        if (!next.has(id) && knownIdsRef.current.has(id)) {
          knownIdsRef.current.delete(id);
          supabase.from("mindmaps").delete().eq("id", id).then(({ error }) => {
            if (error) console.error("[mindmapSync] delete", error);
          });
        }
      }

      // Upserts (only if changed)
      for (const p of state.projects) {
        const before = prev.get(p.id);
        if (before && before === p) continue; // same reference → unchanged
        const existing = timers.get(p.id);
        if (existing) clearTimeout(existing);
        timers.set(
          p.id,
          setTimeout(() => {
            supabase
              .from("mindmaps")
              .upsert(
                {
                  id: p.id,
                  user_id: userId,
                  title: p.title,
                  data: { nodes: p.nodes, viewport: p.viewport } as any,
                },
                { onConflict: "id" },
              )

              .then(({ error }) => {
                if (error) console.error("[mindmapSync] upsert", error);
                else knownIdsRef.current.add(p.id);
              });
          }, 400),
        );
      }

      prevRef.current = next;
    });
    return () => {
      unsub();
      for (const t of timers.values()) clearTimeout(t);
    };
  }, [userId]);
}
