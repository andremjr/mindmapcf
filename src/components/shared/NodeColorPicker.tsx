import { NODE_COLOR_PALETTE } from "@/lib/nodeColors";

/**
 * Compact color-picker row for a single node. Combines the preset palette
 * with a native color input so the user can pick any hue/tone from the OS
 * spectrum picker (hue strip + shade area).
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
  const current = value ?? "";
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {NODE_COLOR_PALETTE.map((c) => {
          const isCurrent = current.toLowerCase() === c.value.toLowerCase();
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

        {/* Full-spectrum picker (OS native — includes hue slider + tone area) */}
        <label
          title="Escolher qualquer cor"
          className="relative inline-flex items-center justify-center rounded-full border border-dashed border-border/70 hover:border-primary/60 cursor-pointer overflow-hidden"
          style={{ width: size, height: size }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "conic-gradient(#ef4444,#eab308,#22c55e,#06b6d4,#3b82f6,#a855f7,#ec4899,#ef4444)",
            }}
          />
          <input
            type="color"
            value={/^#([0-9a-f]{6})$/i.test(current) ? current : "#3b82f6"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label="Escolher qualquer cor"
          />
        </label>

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
