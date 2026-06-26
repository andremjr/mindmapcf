import type { Project, TextNode, BlockType, MarkerStyle, CameraEase } from "@/lib/types";
import { BLOCK_TYPE_LABEL } from "@/lib/types";
import type { EditorStep } from "./LeftSidebar";
import { useStore } from "@/lib/store";
import { VISUAL_PRESETS } from "@/lib/presets";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs py-2 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-mono text-foreground/90 truncate max-w-[60%] text-right">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-border/40">
      <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{title}</h3>
      <div>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3 last:mb-0">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const MARKERS: MarkerStyle[] = ["bracket", "vline", "arrow", "dot", "none"];
const EASINGS: CameraEase[] = ["cinematic", "ease-in-out", "ease-out", "ease-in", "linear"];
const TYPES: BlockType[] = [
  "intro",
  "main_idea",
  "detail",
  "contrast",
  "problem",
  "solution",
  "example",
  "conclusion",
  "warning",
];
const ACCENT_PALETTE = [
  "oklch(0.78 0.16 220)",
  "oklch(0.68 0.21 35)",
  "oklch(0.74 0.16 160)",
  "oklch(0.78 0.17 60)",
  "oklch(0.68 0.18 305)",
  "oklch(0.92 0.04 95)",
];

export function PropertiesPanel({ project, step }: { project: Project; step: EditorStep }) {
  const v = project.visualPreset;
  const playback = useStore((s) => s.playback);
  const updateNode = useStore((s) => s.updateNode);
  const updateCamera = useStore((s) => s.updateCamera);
  const setPreset = useStore((s) => s.setPreset);
  const updatePreset = useStore((s) => s.updatePreset);

  const selected: TextNode | undefined = playback.selectedNodeId
    ? project.nodes.find((n) => n.id === playback.selectedNodeId)
    : undefined;
  const cameraKey = selected
    ? project.camera.find((k) => k.targetNodeId === selected.id)
    : undefined;

  return (
    <aside className="w-80 shrink-0 border-l border-border/60 bg-sidebar/40 backdrop-blur overflow-y-auto">
      <div className="px-4 py-4 border-b border-border/40">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Propriedades</div>
        <div className="text-display text-sm mt-1 capitalize">{step}</div>
      </div>

      {step === "canvas" && (
        <Section title="Preset visual">
          <select
            value={v.id}
            onChange={(e) => setPreset(project.id, e.target.value)}
            className="w-full bg-background border border-border/60 rounded px-2 py-1.5 text-xs"
          >
            {VISUAL_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2 mt-3">
            {[v.backgroundColor, v.accentColor, v.secondaryAccentColor, v.textColor, v.mutedTextColor].map((c, i) => (
              <div key={i} className="size-6 rounded border border-border/60" style={{ background: c }} />
            ))}
          </div>
          <SliderRow
            label="Glow"
            value={v.glowIntensity}
            onChange={(n) => updatePreset(project.id, { glowIntensity: n })}
          />
          <SliderRow
            label="Profundidade"
            value={v.depthIntensity}
            onChange={(n) => updatePreset(project.id, { depthIntensity: n })}
          />
          <SliderRow
            label="Blur"
            value={v.blurIntensity}
            onChange={(n) => updatePreset(project.id, { blurIntensity: n })}
          />
          <SliderRow
            label="Câmera"
            value={v.cameraMovementIntensity}
            onChange={(n) => updatePreset(project.id, { cameraMovementIntensity: n })}
          />
          <SliderRow
            label="Vignette"
            value={v.vignette}
            onChange={(n) => updatePreset(project.id, { vignette: n })}
          />
          <SliderRow
            label="Grain"
            value={v.grain}
            onChange={(n) => updatePreset(project.id, { grain: n })}
          />
        </Section>
      )}

      {step === "canvas" && selected ? (
        <>
          <Section title="Nó selecionado">
            <Field label="Texto curto">
              <textarea
                value={selected.shortText}
                onChange={(e) => updateNode(project.id, selected.id, { shortText: e.target.value })}
                rows={3}
                className="w-full bg-background border border-border/60 rounded px-2 py-1 text-xs"
              />
            </Field>
            <Field label="Tipo">
              <select
                value={selected.type}
                onChange={(e) =>
                  updateNode(project.id, selected.id, { type: e.target.value as BlockType })
                }
                className="w-full bg-background border border-border/60 rounded px-2 py-1 text-xs"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {BLOCK_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cor de destaque">
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => updateNode(project.id, selected.id, { accentColor: undefined })}
                  className={`size-6 rounded border-2 ${
                    !selected.accentColor ? "border-primary" : "border-border/60"
                  }`}
                  style={{ background: "transparent" }}
                  title="Padrão"
                />
                {ACCENT_PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => updateNode(project.id, selected.id, { accentColor: c })}
                    className={`size-6 rounded border-2 ${
                      selected.accentColor === c ? "border-primary" : "border-border/60"
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </Field>
            <Field label="Marcador">
              <div className="flex gap-1">
                {MARKERS.map((m) => (
                  <button
                    key={m}
                    onClick={() => updateNode(project.id, selected.id, { markerStyle: m })}
                    className={`flex-1 text-[10px] py-1 rounded border ${
                      selected.markerStyle === m
                        ? "border-primary text-primary"
                        : "border-border/60 text-muted-foreground"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </Field>
            <SliderRow
              label="Escala"
              min={0.5}
              max={2.5}
              value={selected.scale}
              onChange={(n) => updateNode(project.id, selected.id, { scale: n })}
            />
            <SliderRow
              label="Rotação"
              min={-15}
              max={15}
              value={selected.rotation}
              onChange={(n) => updateNode(project.id, selected.id, { rotation: n })}
            />
            <SliderRow
              label="Opacidade"
              value={selected.opacity}
              onChange={(n) => updateNode(project.id, selected.id, { opacity: n })}
            />
            <SliderRow
              label="Profundidade Z"
              min={-2}
              max={2}
              step={1}
              value={selected.z}
              onChange={(n) => updateNode(project.id, selected.id, { z: n })}
            />
          </Section>

          {cameraKey && (
            <Section title="Câmera no nó">
              <SliderRow
                label="Zoom"
                min={0.3}
                max={3}
                value={cameraKey.zoom}
                onChange={(n) => updateCamera(project.id, cameraKey.id, { zoom: n })}
              />
              <SliderRow
                label="Duração transição"
                min={0.2}
                max={4}
                value={cameraKey.duration}
                onChange={(n) => updateCamera(project.id, cameraKey.id, { duration: n })}
              />
              <SliderRow
                label="Intensidade de foco"
                value={cameraKey.focusIntensity}
                onChange={(n) => updateCamera(project.id, cameraKey.id, { focusIntensity: n })}
              />
              <SliderRow
                label="Intensidade de profundidade"
                value={cameraKey.depthIntensity}
                onChange={(n) => updateCamera(project.id, cameraKey.id, { depthIntensity: n })}
              />
              <SliderRow
                label="Rotação"
                min={-15}
                max={15}
                value={cameraKey.rotation}
                onChange={(n) => updateCamera(project.id, cameraKey.id, { rotation: n })}
              />
              <Field label="Easing">
                <select
                  value={cameraKey.easing}
                  onChange={(e) =>
                    updateCamera(project.id, cameraKey.id, { easing: e.target.value as CameraEase })
                  }
                  className="w-full bg-background border border-border/60 rounded px-2 py-1 text-xs"
                >
                  {EASINGS.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </Field>
            </Section>
          )}
        </>
      ) : (
        <Section title="Projeto">
          <Row label="ID" value={project.id} />
          <Row label="Duração" value={`${Math.floor(project.durationSec)}s`} />
          <Row label="Blocos" value={project.blocks.length} />
          <Row label="Nós" value={project.nodes.length} />
          <Row label="Keyframes" value={project.camera.length} />
          <Row label="SFX" value={project.sfx.length} />
          <Row label="Safe area" value={project.safeArea ?? "16:9"} />
        </Section>
      )}

      <Section title="Render">
        <Row label="Resolução" value={`${project.render.width}×${project.render.height}`} />
        <Row label="FPS" value={project.render.fps} />
        <Row label="Formato" value={project.render.format} />
        <Row label="Qualidade" value={project.render.quality} />
      </Section>
    </aside>
  );
}

function SliderRow({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>{label}</span>
        <span className="text-mono text-foreground/80">{value.toFixed(2)}</span>
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
