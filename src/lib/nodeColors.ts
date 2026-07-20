import type { MindNode } from "./types";

/** Preset accent palette exposed in the color picker. */
export const NODE_COLOR_PALETTE: { name: string; value: string }[] = [
  { name: "Azul (padrão)", value: "#3B82F6" },
  { name: "Ciano", value: "#06B6D4" },
  { name: "Verde", value: "#22C55E" },
  { name: "Lima", value: "#A3E635" },
  { name: "Amarelo", value: "#EAB308" },
  { name: "Laranja", value: "#F97316" },
  { name: "Vermelho", value: "#EF4444" },
  { name: "Rosa", value: "#EC4899" },
  { name: "Roxo", value: "#A855F7" },
  { name: "Cinza", value: "#94A3B8" },
];

/** Fallback when no ancestor sets a color. */
export const DEFAULT_ACCENT = "var(--primary)";

/**
 * Compute the effective color of every node.
 *
 * Rule: a node inherits the color of its closest ancestor that has one set.
 * If no ancestor has a color, falls back to DEFAULT_ACCENT.
 * Setting a color on a node therefore paints its whole branch, unless a
 * descendant overrides it with its own color.
 */
export function buildColorMap(nodes: MindNode[]): Map<string, string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, string>();
  function resolve(id: string): string {
    const cached = memo.get(id);
    if (cached) return cached;
    const n = byId.get(id);
    if (!n) return DEFAULT_ACCENT;
    const own = n.color;
    if (own) {
      memo.set(id, own);
      return own;
    }
    if (!n.parentId) {
      memo.set(id, DEFAULT_ACCENT);
      return DEFAULT_ACCENT;
    }
    const c = resolve(n.parentId);
    memo.set(id, c);
    return c;
  }
  const out = new Map<string, string>();
  for (const n of nodes) out.set(n.id, resolve(n.id));
  return out;
}
