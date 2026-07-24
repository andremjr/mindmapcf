// Config for the "Comparação de Escala" format.
// Stored as JSON in the root node's `body` field.

export type ScaleMode = "real" | "compressed" | "visual";
export type SortMode = "asc" | "desc" | "manual";

export interface ScaleConfig {
  /** Global default unit ("m", "km", "R$", "hab.", "km/h", ...). */
  unit: string;
  /** How bar heights map from values. */
  scaleMode: ScaleMode;
  /** Sort order of bars. */
  sortMode: SortMode;
  /** Accent color (highlights, top labels, active bar glow). */
  accentColor: string;
  /** Base color of the bar body (front face). Sides derive from it. */
  barColor: string;
  /** Optional caption shown in the intro overview step. */
  caption: string;
}

export const DEFAULT_SCALE: ScaleConfig = {
  unit: "",
  scaleMode: "visual",
  sortMode: "asc",
  accentColor: "#fbbf24",
  barColor: "#38bdf8",
  caption: "Uma comparação em escala.",
};

export function parseScaleConfig(body: string | undefined): ScaleConfig {
  try {
    const p = body ? JSON.parse(body) : {};
    const merged: ScaleConfig = { ...DEFAULT_SCALE, ...p };
    if (!["real", "compressed", "visual"].includes(merged.scaleMode)) merged.scaleMode = "visual";
    if (!["asc", "desc", "manual"].includes(merged.sortMode)) merged.sortMode = "asc";
    if (typeof merged.accentColor !== "string" || !merged.accentColor) merged.accentColor = "#fbbf24";
    if (typeof merged.barColor !== "string" || !merged.barColor) merged.barColor = "#38bdf8";
    if (typeof merged.unit !== "string") merged.unit = "";
    if (typeof merged.caption !== "string") merged.caption = DEFAULT_SCALE.caption;
    return merged;
  } catch {
    return DEFAULT_SCALE;
  }
}

/** Per-item data serialized in the item's `body` field. */
export interface ScaleItemData {
  value: number;
  unit?: string; // overrides the global unit when set
  note?: string; // optional complementary text
}

export function parseItemData(body: string | undefined): ScaleItemData {
  try {
    const p = body ? JSON.parse(body) : {};
    const v = Number(p.value);
    return {
      value: Number.isFinite(v) ? v : 0,
      unit: typeof p.unit === "string" ? p.unit : undefined,
      note: typeof p.note === "string" ? p.note : undefined,
    };
  } catch {
    return { value: 0 };
  }
}

export function serializeItemData(d: ScaleItemData): string {
  return JSON.stringify({
    value: Number.isFinite(d.value) ? d.value : 0,
    unit: d.unit ?? undefined,
    note: d.note ?? undefined,
  });
}

/**
 * Map a numeric value → 0..1 bar height ratio according to the scale mode.
 * `values` is the list of ALL values on the chart (so we can normalize).
 */
export function heightRatio(value: number, values: number[], mode: ScaleMode): number {
  const pos = values.filter((v) => Number.isFinite(v) && v > 0);
  if (pos.length === 0 || !Number.isFinite(value) || value <= 0) return 0.02;
  const max = Math.max(...pos);
  const min = Math.min(...pos);
  if (mode === "real") {
    return Math.max(0.02, Math.min(1, value / max));
  }
  if (mode === "compressed") {
    // log compression: very tall bars still tower over short ones,
    // but tiny values remain visible.
    const lv = Math.log10(value + 1);
    const lmax = Math.log10(max + 1);
    return Math.max(0.06, Math.min(1, lv / lmax));
  }
  // "visual": rank-based spread → readable even when values differ by orders of magnitude
  const sorted = [...pos].sort((a, b) => a - b);
  const rank = sorted.indexOf(value);
  const norm = sorted.length > 1 ? rank / (sorted.length - 1) : 1;
  // Bias so the smallest still has ~18% of the tallest and the tallest is 100%.
  const eased = 0.18 + norm * 0.82;
  // Small tie-break using true value ratio so ties near max don't look identical.
  const trueRatio = value / max;
  return Math.max(0.06, Math.min(1, eased * 0.7 + trueRatio * 0.3));
}

export function formatValue(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} bi`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (abs >= 10_000) return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
