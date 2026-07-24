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
  /**
   * Random draw ("sorteio") result: an ordered list of competitor IDs that
   * determines seat/slot assignment in the bracket. When absent, the bracket
   * falls back to the competitors' natural editor order — useful before the
   * draw is performed. Missing IDs (added after the draw) go to the end;
   * stale IDs (deleted competitors) are dropped on read.
   */
  seedOrder?: string[];
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
function normalizeSeedOrder(s: unknown): string[] | undefined {
  if (!Array.isArray(s)) return undefined;
  const ids = s.filter((x): x is string => typeof x === "string");
  return ids.length > 0 ? ids : undefined;
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
        seedOrder: normalizeSeedOrder((p as any).seedOrder),
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
    ...(cfg.seedOrder && cfg.seedOrder.length ? { seedOrder: cfg.seedOrder } : {}),
  });
}

/**
 * Given the editor-ordered `competitors` and an optional `seedOrder`, return
 * competitors arranged in bracket-seating order. Unknown/stale IDs in
 * `seedOrder` are ignored; competitors not mentioned in `seedOrder` are
 * appended in their original order (so newly-added competitors after a draw
 * still show up on the board — the author can re-sortear when ready).
 */
export function seatCompetitors<T extends { id: string }>(
  competitors: T[],
  seedOrder: string[] | undefined,
): T[] {
  if (!seedOrder || seedOrder.length === 0) return competitors;
  const byId = new Map(competitors.map((c) => [c.id, c] as const));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const id of seedOrder) {
    const c = byId.get(id);
    if (c && !seen.has(id)) { out.push(c); seen.add(id); }
  }
  for (const c of competitors) if (!seen.has(c.id)) out.push(c);
  return out;
}

/** Fisher-Yates shuffle — returns a new array of competitor IDs. */
export function drawSeedOrder<T extends { id: string }>(competitors: T[]): string[] {
  const ids = competitors.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

