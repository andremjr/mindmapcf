import { Mic, FileText, Layers, Square, Sparkles, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

export type EditorStep = "audio" | "transcript" | "blocks" | "canvas" | "sound" | "render";

const STEPS: { id: EditorStep; label: string; icon: typeof Mic; needs?: (p: Project) => boolean }[] = [
  { id: "audio", label: "Áudio", icon: Mic },
  { id: "transcript", label: "Transcrição", icon: FileText, needs: (p) => !!p.audio },
  { id: "blocks", label: "Blocos", icon: Layers, needs: (p) => !!p.transcript },
  { id: "canvas", label: "Canvas", icon: Square, needs: (p) => p.blocks.length > 0 },
  { id: "sound", label: "Som & SFX", icon: Sparkles, needs: (p) => p.blocks.length > 0 },
  { id: "render", label: "Render", icon: Download, needs: (p) => p.blocks.length > 0 },
];

export function LeftSidebar({
  step,
  onStepChange,
  project,
}: {
  step: EditorStep;
  onStepChange: (s: EditorStep) => void;
  project: Project;
}) {
  return (
    <aside className="w-56 shrink-0 border-r border-border/60 bg-sidebar/40 backdrop-blur flex flex-col">
      <div className="px-4 py-4 text-[11px] uppercase tracking-widest text-muted-foreground">
        Pipeline
      </div>
      <nav className="px-2 flex-1 space-y-0.5">
        {STEPS.map((s, i) => {
          const enabled = !s.needs || s.needs(project);
          const Icon = s.icon;
          const active = step === s.id;
          return (
            <button
              key={s.id}
              onClick={() => enabled && onStepChange(s.id)}
              disabled={!enabled}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition relative",
                active
                  ? "bg-primary/15 text-foreground"
                  : enabled
                  ? "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  : "text-muted-foreground/40 cursor-not-allowed",
              )}
            >
              {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 bg-primary rounded-r" />}
              <span className={cn(
                "size-6 rounded grid place-items-center text-mono text-[10px] shrink-0",
                active ? "bg-primary text-primary-foreground" : "bg-muted/60",
              )}>
                {i + 1}
              </span>
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{s.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="p-3 mx-2 mb-3 rounded-md bg-muted/40 border border-border/40 text-[11px] text-muted-foreground">
        <div className="text-mono text-foreground/80 mb-1">{project.id}</div>
        Última atualização<br />
        <span className="text-mono">{new Date(project.updatedAt).toLocaleString("pt-BR")}</span>
      </div>
    </aside>
  );
}
