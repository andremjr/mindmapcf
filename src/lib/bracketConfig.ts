// Per-project bracket config, serialized as JSON on the root node's `body`.
// Historically `body` held ONLY the winners map ({ [matchKey]: competitorId }).
// We now also store `itemAspect` (image aspect ratio for competitor cards),
// wrapped as { winners, itemAspect }. Legacy bodies (bare winners map) are
// detected and migrated transparently on read.

import type { ItemAspect } from "@/lib/tierlistConfig";

export type WinnersMap = Record<string, string>;

export interface BracketConfig {
  winners: WinnersMap;
  itemAspect: ItemAspect;
}

export const DEFAULT_BRACKET_CONFIG: BracketConfig = {
  winners: {},
  itemAspect: "square",
};

export function parseBracketConfig(body: string | undefined | null): BracketConfig {
  if (!body) return { winners: {}, itemAspect: "square" };
  try {
    const p = JSON.parse(body);
    if (p && typeof p === "object" && "winners" in p) {
      const a = (p as any).itemAspect;
      return {
        winners: ((p as any).winners ?? {}) as WinnersMap,
        itemAspect: a === "portrait" || a === "landscape" ? a : "square",
      };
    }
    // Legacy shape: entire body is the winners map.
    if (p && typeof p === "object") {
      return { winners: p as WinnersMap, itemAspect: "square" };
    }
  } catch { /* fallthrough */ }
  return { winners: {}, itemAspect: "square" };
}

export function serializeBracketConfig(cfg: BracketConfig): string {
  return JSON.stringify({ winners: cfg.winners, itemAspect: cfg.itemAspect });
}
