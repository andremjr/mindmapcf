import { useMemo, useState } from "react";
import { Download, Copy, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { Project, RenderAspect, RenderTarget } from "@/lib/types";
import { useStore } from "@/lib/store";
import {
  buildExport,
  validateExport,
  downloadJson,
  copyJson,
} from "@/lib/renderExport";
import { RENDER_ADAPTERS } from "@/lib/renderAdapters";

const ASPECTS: { id: RenderAspect; w: number; h: number; label: string }[] = [
  { id: "horizontal", w: 1920, h: 1080, label: "16:9 · 1920×1080" },
  { id: "vertical", w: 1080, h: 1920, label: "9:16 · 1080×1920" },
  { id: "square", w: 1080, h: 1080, label: "1:1 · 1080×1080" },
];

const TARGETS: RenderTarget[] = ["remotion", "hyperframes", "generic"];

export function RenderPanel({ project }: { project: Project }) {
  const updateRender = useStore((s) => s.updateRenderConfig);
  const [copied, setCopied] = useState(false);

  const exportData = useMemo(() => buildExport(project), [project]);
  const issues = useMemo(() => validateExport(exportData), [exportData]);
  const target = project.render.exportTarget ?? "remotion";
  const adapter = RENDER_ADAPTERS[target] ?? RENDER_ADAPTERS.generic;
  const payload = useMemo(() => adapter.transform(exportData), [adapter, exportData]);

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const ok = errors.length === 0;

  const json = useMemo(() => JSON.stringify(payload, null, 2), [payload]);

  return (
    <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-display text-lg">Exportar para Render</h2>
          <p className="text-xs text-muted-foreground mt-1">
            JSON canônico com transcript, blocos, nós, câmera, SFX, presets e
            asset registry — pronto para Remotion, HyperFrames ou renderizador
            genérico.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={!ok}
            onClick={async () => {
              const okClip = await copyJson(payload);
              if (okClip) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            }}
            className="flex items-center gap-2 px-3 py-2 rounded border border-border/60 text-xs hover:bg-muted/50 disabled:opacity-40"
          >
            <Copy className="size-3.5" /> {copied ? "Copiado!" : "Copiar JSON"}
          </button>
          <button
            disabled={!ok}
            onClick={() =>
              downloadJson(`${project.id}-${target}.json`, payload)
            }
            className="flex items-center gap-2 px-3 py-2 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-40"
          >
            <Download className="size-3.5" /> Baixar JSON
          </button>
        </div>
      </header>

      <section className="grid md:grid-cols-3 gap-4 mb-5">
        <div className="surface-card p-4">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Formato
          </h3>
          <div className="space-y-1.5">
            {ASPECTS.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="aspect"
                  checked={project.render.aspect === a.id}
                  onChange={() =>
                    updateRender(project.id, { aspect: a.id, width: a.w, height: a.h })
                  }
                  className="accent-primary"
                />
                <span>{a.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="surface-card p-4 text-xs space-y-3">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Parâmetros
          </h3>
          <NumField
            label="FPS"
            value={project.render.fps}
            onChange={(v) => updateRender(project.id, { fps: v })}
            min={12}
            max={120}
          />
          <RangeField
            label="Text scale"
            value={project.render.textScale}
            min={0.5}
            max={2}
            step={0.05}
            onChange={(v) => updateRender(project.id, { textScale: v })}
          />
          <RangeField
            label="Motion intensity"
            value={project.render.motionIntensity}
            onChange={(v) => updateRender(project.id, { motionIntensity: v })}
          />
          <RangeField
            label="Depth intensity"
            value={project.render.depthIntensity}
            onChange={(v) => updateRender(project.id, { depthIntensity: v })}
          />
        </div>

        <div className="surface-card p-4 text-xs space-y-3">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Target
          </h3>
          <select
            value={target}
            onChange={(e) =>
              updateRender(project.id, { exportTarget: e.target.value as RenderTarget })
            }
            className="w-full bg-background border border-border/60 rounded px-2 py-1.5 text-xs"
          >
            {TARGETS.map((t) => (
              <option key={t} value={t}>
                {RENDER_ADAPTERS[t]?.name ?? t}
              </option>
            ))}
          </select>
          <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground mt-3">
            Audio mixing
          </h4>
          <RangeField
            label="Speech"
            value={project.render.audioMixing.speechGain}
            min={0}
            max={1.5}
            step={0.05}
            onChange={(v) =>
              updateRender(project.id, {
                audioMixing: { ...project.render.audioMixing, speechGain: v },
              })
            }
          />
          <RangeField
            label="SFX"
            value={project.render.audioMixing.sfxGain}
            min={0}
            max={1.5}
            step={0.05}
            onChange={(v) =>
              updateRender(project.id, {
                audioMixing: { ...project.render.audioMixing, sfxGain: v },
              })
            }
          />
        </div>
      </section>

      <section className="surface-card p-4 mb-5">
        <h3 className="text-display text-sm mb-3 flex items-center gap-2">
          {ok ? (
            <CheckCircle2 className="size-4 text-primary" />
          ) : (
            <XCircle className="size-4 text-destructive" />
          )}
          Validação
        </h3>
        {issues.length === 0 ? (
          <div className="text-xs text-primary">Tudo certo — JSON pronto para export.</div>
        ) : (
          <ul className="text-xs space-y-1">
            {errors.map((i, k) => (
              <li key={`e${k}`} className="flex items-start gap-2 text-destructive">
                <XCircle className="size-3.5 shrink-0 mt-0.5" />
                {i.message}
              </li>
            ))}
            {warnings.map((i, k) => (
              <li key={`w${k}`} className="flex items-start gap-2 text-amber-400">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                {i.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface-card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/40">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Preview JSON ({target})
          </span>
          <span className="text-[10px] text-mono text-muted-foreground">
            {(json.length / 1024).toFixed(1)} KB
          </span>
        </div>
        <pre className="text-[11px] text-mono leading-relaxed p-4 max-h-[480px] overflow-auto bg-background/40">
          {json.length > 30000 ? json.slice(0, 30000) + "\n…(truncado)" : json}
        </pre>
      </section>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 bg-background border border-border/60 rounded px-2 py-1 text-xs text-right"
      />
    </label>
  );
}

function RangeField({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <div className="flex justify-between text-muted-foreground">
        <span>{label}</span>
        <span className="text-mono">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}
