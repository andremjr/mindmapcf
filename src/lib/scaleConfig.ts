// Config for the "Comparação de Escala" format.
// Stored as JSON in the root node's `body` field.

export type ScaleMode = "real";
export type SortMode = "asc" | "desc" | "manual";

export interface ScaleConfig {
  /** Global default unit ("m", "km", "R$", "hab.", "km/h", ...). */
  unit: string;
  /** Always real (proportional). Kept for backward compat. */
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
  scaleMode: "real",
  sortMode: "asc",
  accentColor: "#fbbf24",
  barColor: "#38bdf8",
  caption: "Uma comparação em escala.",
};

export function parseScaleConfig(body: string | undefined): ScaleConfig {
  try {
    const p = body ? JSON.parse(body) : {};
    const merged: ScaleConfig = { ...DEFAULT_SCALE, ...p, scaleMode: "real" };
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
 * Real proportional height ratio (0..1) relative to the tallest positive value.
 * Kept for the editor thumbnail strip; the presentation now uses world coords directly.
 */
export function heightRatio(value: number, values: number[]): number {
  const pos = values.filter((v) => Number.isFinite(v) && v > 0);
  if (pos.length === 0 || !Number.isFinite(value) || value <= 0) return 0.02;
  const max = Math.max(...pos);
  return Math.max(0.02, Math.min(1, value / max));
}

export function formatValue(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} bi`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (abs >= 10_000) return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
