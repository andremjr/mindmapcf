// Per-project tier list config, serialized as JSON on the board node's `body`.
// Right now it only carries the image aspect ratio the author picked so all
// item cards show images consistently (some galleries are all portrait,
// others are all landscape, etc.). Kept as a tiny module so the editor and
// the presentation stay in sync.

export type ItemAspect = "square" | "portrait" | "landscape";

export interface TierListConfig {
  itemAspect: ItemAspect;
}

export const DEFAULT_TIERLIST_CONFIG: TierListConfig = {
  itemAspect: "square",
};

export function parseTierListConfig(body: string | undefined | null): TierListConfig {
  if (!body) return { ...DEFAULT_TIERLIST_CONFIG };
  try {
    const p = JSON.parse(body);
    const a = p?.itemAspect;
    return {
      itemAspect: a === "portrait" || a === "landscape" ? a : "square",
    };
  } catch {
    return { ...DEFAULT_TIERLIST_CONFIG };
  }
}

export function serializeTierListConfig(cfg: TierListConfig): string {
  return JSON.stringify(cfg);
}

/** Given a "base" short-side size in px, return the {w,h} for a given aspect. */
export function aspectDims(base: number, aspect: ItemAspect): { w: number; h: number } {
  switch (aspect) {
    case "portrait":  return { w: Math.round(base * 0.78), h: Math.round(base * 1.05) };
    case "landscape": return { w: Math.round(base * 1.25), h: Math.round(base * 0.78) };
    default:          return { w: base, h: base };
  }
}

export const ASPECT_OPTIONS: { id: ItemAspect; label: string; hint: string }[] = [
  { id: "square",    label: "Quadrado",   hint: "1:1"  },
  { id: "portrait",  label: "Vertical",   hint: "3:4"  },
  { id: "landscape", label: "Horizontal", hint: "4:3"  },
];
