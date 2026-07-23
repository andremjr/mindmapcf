import { NODE_COLOR_PALETTE } from "@/lib/nodeColors";

/**
 * Compact color-picker row for a single node. Mirrors the mindmap picker so
 * every format (graphs, ranking, bracket, tier list, iceberg) can differentiate
 * items by color using the same palette.
 */
export function NodeColorPicker({
  value,
  onChange,
  label = "Cor do card",
  size = 20,
}: {
  value?: string | null;
  onChange: (color: string | undefined) => void;
  label?: string;
  size?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {NODE_COLOR_PALETTE.map((c) => {
          const isCurrent = (value ?? "").toLowerCase() === c.value.toLowerCase();
          return (
            <button
              key={c.value}
              type="button"
              title={c.name}
              onClick={() => onChange(c.value)}
              className={`rounded-full border transition-transform ${
                isCurrent
                  ? "ring-2 ring-offset-1 ring-offset-background ring-foreground/60 scale-110 border-transparent"
                  : "border-border/60 hover:scale-110"
              }`}
              style={{ width: size, height: size, background: c.value }}
            />
          );
        })}
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-[10px] px-2 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40"
          title="Sem cor personalizada"
        >
          Limpar
        </button>
      </div>
    </div>
  );
}
