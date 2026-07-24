// Per-project bracket config, serialized as JSON on the root node's `body`.
// Historically `body` held ONLY the winners map ({ [matchKey]: competitorId }).
// We now also store `itemAspect` (image aspect ratio for competitor cards)
// and `accentColor` (highlight color used across editor & presentation for the
// "current match" ring and thematic amber accents — lets creators match their
// channel identity). Legacy bodies (bare winners map) are detected and
// migrated transparently on read.

import type { ItemAspect } from "@/lib/tierlistConfig";

export type WinnersMap = Record<string, string>;

export interface BracketConfig {
  winners: WinnersMap;
  itemAspect: ItemAspect;
  accentColor: string;
}

export const DEFAULT_ACCENT_COLOR = "#fbbf24"; // amber-400

export const DEFAULT_BRACKET_CONFIG: BracketConfig = {
  winners: {},
  itemAspect: "square",
  accentColor: DEFAULT_ACCENT_COLOR,
};

function normalizeAspect(a: unknown): ItemAspect {
  return a === "portrait" || a === "landscape" ? a : "square";
}
function normalizeColor(c: unknown): string {
  return typeof c === "string" && /^#([0-9a-fA-F]{3,8})$/.test(c) ? c : DEFAULT_ACCENT_COLOR;
}

export function parseBracketConfig(body: string | undefined | null): BracketConfig {
  if (!body) return { ...DEFAULT_BRACKET_CONFIG };
  try {
    const p = JSON.parse(body);
    if (p && typeof p === "object" && "winners" in p) {
      return {
        winners: ((p as any).winners ?? {}) as WinnersMap,
        itemAspect: normalizeAspect((p as any).itemAspect),
        accentColor: normalizeColor((p as any).accentColor),
      };
    }
    // Legacy shape: entire body is the winners map.
    if (p && typeof p === "object") {
      return { ...DEFAULT_BRACKET_CONFIG, winners: p as WinnersMap };
    }
  } catch { /* fallthrough */ }
  return { ...DEFAULT_BRACKET_CONFIG };
}

export function serializeBracketConfig(cfg: BracketConfig): string {
  return JSON.stringify({
    winners: cfg.winners,
    itemAspect: cfg.itemAspect,
    accentColor: cfg.accentColor,
  });
}
