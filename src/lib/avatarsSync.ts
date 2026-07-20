import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "./store";
import type { SonicAvatarEntry } from "./types";
import { toast } from "sonner";

interface Row {
  id: string;
  user_id: string;
  name: string;
  image_ref: any | null;
  bg_color: string;
  wave_color: string;
  size_pct: number;
}

function rowToEntry(r: Row): SonicAvatarEntry {
  return {
    id: r.id,
    name: r.name,
    imageRef: r.image_ref ?? undefined,
    imageName: r.image_ref?.name,
    bgColor: r.bg_color,
    waveColor: r.wave_color,
    sizePct: r.size_pct,
  };
}

/** One-time loader — call inside the projects layout. */
export function useAvatarsSync(userId: string | undefined) {
  const hydrateAvatars = useStore((s) => s.hydrateAvatars);
  useEffect(() => {
    if (!userId) {
      hydrateAvatars([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("sonic_avatars")
        .select("id, user_id, name, image_ref, bg_color, wave_color, size_pct")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("[avatarsSync]", error);
        return;
      }
      hydrateAvatars((data as Row[]).map(rowToEntry));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, hydrateAvatars]);
}

export async function createAvatarRemote(
  userId: string,
  entry: Omit<SonicAvatarEntry, "id">,
): Promise<SonicAvatarEntry | null> {
  const { data, error } = await (supabase as any)
    .from("sonic_avatars")
    .insert({
      user_id: userId,
      name: entry.name,
      image_ref: entry.imageRef ?? null,
      bg_color: entry.bgColor,
      wave_color: entry.waveColor,
      size_pct: entry.sizePct,
    })
    .select("id, user_id, name, image_ref, bg_color, wave_color, size_pct")
    .single();
  if (error) {
    const msg = String(error.message || error);
    if (msg.includes("PRO_REQUIRED_FOR_AVATAR")) {
      toast.error("Avatares sonoros são exclusivos do plano Pro.");
    } else if (msg.includes("AVATAR_LIMIT_EXCEEDED")) {
      toast.error("Você atingiu o limite de 10 avatares.");
    } else {
      toast.error("Não foi possível criar o avatar.");
      console.error("[avatarsSync] create", error);
    }
    return null;
  }
  const created = rowToEntry(data as Row);
  useStore.getState().upsertAvatarLocal(created);
  return created;
}

export async function updateAvatarRemote(
  id: string,
  patch: Partial<Omit<SonicAvatarEntry, "id">>,
): Promise<void> {
  const dbPatch: any = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.imageRef !== undefined) dbPatch.image_ref = patch.imageRef ?? null;
  if (patch.bgColor !== undefined) dbPatch.bg_color = patch.bgColor;
  if (patch.waveColor !== undefined) dbPatch.wave_color = patch.waveColor;
  if (patch.sizePct !== undefined) dbPatch.size_pct = patch.sizePct;

  // Optimistic local update
  const s = useStore.getState();
  const existing = s.avatars.find((a) => a.id === id);
  if (existing) {
    s.upsertAvatarLocal({ ...existing, ...patch });
  }

  const { error } = await (supabase as any).from("sonic_avatars").update(dbPatch).eq("id", id);
  if (error) {
    console.error("[avatarsSync] update", error);
    toast.error("Falha ao salvar avatar.");
  }
}

export async function deleteAvatarRemote(id: string): Promise<void> {
  useStore.getState().removeAvatarLocal(id);
  const { error } = await (supabase as any).from("sonic_avatars").delete().eq("id", id);
  if (error) {
    console.error("[avatarsSync] delete", error);
    toast.error("Falha ao remover avatar.");
  }
}
