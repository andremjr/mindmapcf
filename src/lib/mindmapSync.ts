import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import type { Folder, MindNode, Project } from "@/lib/types";


interface Row {
  id: string;
  title: string;
  folder_id: string | null;
  data: {
    nodes: Project["nodes"];
    viewport?: Project["viewport"];
    sonicAvatar?: Project["sonicAvatar"];
    narrationRef?: Project["narrationRef"];
    template?: Project["template"];
    icebergAtmosphere?: Project["icebergAtmosphere"];
  };
  created_at: string;
  updated_at: string;
}

interface FolderRow {
  id: string;
  name: string;
  color: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

function toProject(r: Row): Project {
  return {
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    folderId: r.folder_id,
    nodes: r.data?.nodes ?? [],
    viewport: r.data?.viewport ?? { x: 0, y: 0, zoom: 1 },
    sonicAvatar: r.data?.sonicAvatar,
    narrationRef: r.data?.narrationRef,
    template: r.data?.template ?? "mindmap",
    icebergAtmosphere: r.data?.icebergAtmosphere,
  };
}

function toFolder(r: FolderRow): Folder {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}


function stripInlineImages(nodes: Project["nodes"]): MindNode[] {
  return nodes.map((node) => {
    const cleanImageRef = node.imageRef
      ? {
          id: node.imageRef.id,
          localPath: node.imageRef.localPath ?? node.imageRef.name,
          name: node.imageRef.name,
          size: node.imageRef.size,
          lastModified: node.imageRef.lastModified,
          contentType: node.imageRef.contentType,
          kind: node.imageRef.kind,
        }
      : undefined;

    const { image: _image, ...rest } = node;
    return {
      ...rest,
      imageRef: cleanImageRef,
      imageName: node.imageName ?? cleanImageRef?.name ?? (node.image ? "Imagem local não reconectada" : undefined),
    };
  });
}

/**
 * Hydrates the store from Supabase for the given user and keeps
 * every project + folder change mirrored to the DB.
 * Mount once (top of the projects area) while a session exists.
 */
export function useMindmapSync(userId: string | undefined) {
  const hydrate = useStore((s) => s.hydrate);
  const hydrateFolders = useStore((s) => s.hydrateFolders);
  const reset = useStore((s) => s.reset);
  const readyRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  const prevRef = useRef<Map<string, Project>>(new Map());
  const knownIdsRef = useRef<Set<string>>(new Set());
  const prevFoldersRef = useRef<Map<string, Folder>>(new Map());
  const knownFolderIdsRef = useRef<Set<string>>(new Set());

  // Load once per user
  useEffect(() => {
    readyRef.current = false;
    setHydrated(false);
    if (!userId) {
      reset();
      prevRef.current = new Map();
      knownIdsRef.current = new Set();
      prevFoldersRef.current = new Map();
      knownFolderIdsRef.current = new Set();
      return;
    }
    (async () => {
      const [mapsRes, foldersRes] = await Promise.all([
        supabase
          .from("mindmaps")
          .select("id, title, folder_id, data, created_at, updated_at")
          .order("updated_at", { ascending: false }),
        supabase
          .from("mindmap_folders")
          .select("id, name, color, position, created_at, updated_at")
          .order("position", { ascending: true }),
      ]);
      if (mapsRes.error) console.error("[mindmapSync] load maps", mapsRes.error);
      if (foldersRes.error) console.error("[mindmapSync] load folders", foldersRes.error);

      const projects = (mapsRes.data ?? []).map((r) => {
        const project = toProject(r as unknown as Row);
        return { ...project, nodes: stripInlineImages(project.nodes) };
      });
      const folders = (foldersRes.data ?? []).map((r) => toFolder(r as unknown as FolderRow));

      hydrate(projects);
      hydrateFolders(folders);
      prevRef.current = new Map(projects.map((p) => [p.id, p]));
      knownIdsRef.current = new Set(projects.map((p) => p.id));
      prevFoldersRef.current = new Map(folders.map((f) => [f.id, f]));
      knownFolderIdsRef.current = new Set(folders.map((f) => f.id));
      readyRef.current = true;
      setHydrated(true);
    })();
  }, [userId, hydrate, hydrateFolders, reset]);


  // Mirror store changes back to Supabase (debounced).
  useEffect(() => {
    if (!userId) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const folderTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const unsub = useStore.subscribe((state) => {
      if (!readyRef.current) return;

      // ---- Projects ----
      const prev = prevRef.current;
      const next = new Map(state.projects.map((p) => [p.id, p]));

      for (const id of prev.keys()) {
        if (!next.has(id) && knownIdsRef.current.has(id)) {
          knownIdsRef.current.delete(id);
          supabase.from("mindmaps").delete().eq("id", id).then(({ error }) => {
            if (error) console.error("[mindmapSync] delete map", error);
          });
        }
      }

      for (const p of state.projects) {
        const before = prev.get(p.id);
        if (before && before === p) continue;
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
                  folder_id: p.folderId ?? null,
                  data: {
                    nodes: stripInlineImages(p.nodes),
                    viewport: p.viewport,
                    sonicAvatar: p.sonicAvatar,
                    narrationRef: p.narrationRef,
                    template: p.template ?? "mindmap",
                  } as any,
                },
                { onConflict: "id" },
              )
              .then(({ error }) => {
                if (error) console.error("[mindmapSync] upsert map", error);
                else knownIdsRef.current.add(p.id);
              });
          }, 400),
        );
      }

      prevRef.current = next;

      // ---- Folders ----
      const prevF = prevFoldersRef.current;
      const nextF = new Map(state.folders.map((f) => [f.id, f]));

      for (const id of prevF.keys()) {
        if (!nextF.has(id) && knownFolderIdsRef.current.has(id)) {
          knownFolderIdsRef.current.delete(id);
          supabase.from("mindmap_folders").delete().eq("id", id).then(({ error }) => {
            if (error) console.error("[mindmapSync] delete folder", error);
          });
        }
      }

      for (const f of state.folders) {
        const before = prevF.get(f.id);
        if (before && before === f) continue;
        const existing = folderTimers.get(f.id);
        if (existing) clearTimeout(existing);
        folderTimers.set(
          f.id,
          setTimeout(() => {
            supabase
              .from("mindmap_folders")
              .upsert(
                {
                  id: f.id,
                  user_id: userId,
                  name: f.name,
                  color: f.color ?? null,
                  position: f.position,
                },
                { onConflict: "id" },
              )
              .then(({ error }) => {
                if (error) console.error("[mindmapSync] upsert folder", error);
                else knownFolderIdsRef.current.add(f.id);
              });
          }, 300),
        );
      }

      prevFoldersRef.current = nextF;
    });
    return () => {
      unsub();
      for (const t of timers.values()) clearTimeout(t);
      for (const t of folderTimers.values()) clearTimeout(t);
    };
  }, [userId]);

  return { hydrated };
}
