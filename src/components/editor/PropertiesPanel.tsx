import type { Project } from "@/lib/types";
import type { EditorStep } from "./LeftSidebar";

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
    <div className="px-4 py-3">
      <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{title}</h3>
      <div>{children}</div>
    </div>
  );
}

export function PropertiesPanel({ project, step }: { project: Project; step: EditorStep }) {
  const v = project.visualPreset;
  return (
    <aside className="w-72 shrink-0 border-l border-border/60 bg-sidebar/40 backdrop-blur overflow-y-auto">
      <div className="px-4 py-4 border-b border-border/40">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Propriedades</div>
        <div className="text-display text-sm mt-1 capitalize">{step}</div>
      </div>

      <Section title="Projeto">
        <Row label="ID" value={project.id} />
        <Row label="Duração" value={`${Math.floor(project.durationSec)}s`} />
        <Row label="Blocos" value={project.blocks.length} />
        <Row label="Nós" value={project.nodes.length} />
        <Row label="Keyframes" value={project.camera.length} />
        <Row label="SFX" value={project.sfx.length} />
      </Section>

      <Section title="Áudio">
        {project.audio ? (
          <>
            <Row label="Arquivo" value={project.audio.name} />
            <Row label="Tamanho" value={`${(project.audio.sizeBytes / 1024 / 1024).toFixed(2)} MB`} />
            <Row label="Tipo" value={project.audio.mimeType} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhum áudio.</p>
        )}
      </Section>

      <Section title="Preset visual">
        <Row label="Nome" value={v.name} />
        <div className="flex gap-2 mt-2">
          {[v.background, v.accent, v.textColor, v.mutedColor].map((c, i) => (
            <div key={i} className="size-6 rounded border border-border/60" style={{ background: c }} />
          ))}
        </div>
        <Row label="Grain" value={v.grain.toFixed(2)} />
        <Row label="Vignette" value={v.vignette.toFixed(2)} />
      </Section>

      <Section title="Render">
        <Row label="Resolução" value={`${project.render.width}×${project.render.height}`} />
        <Row label="FPS" value={project.render.fps} />
        <Row label="Formato" value={project.render.format} />
        <Row label="Qualidade" value={project.render.quality} />
      </Section>
    </aside>
  );
}
