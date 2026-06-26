import type { Project } from "@/lib/types";
import type { EditorStep } from "./LeftSidebar";
import { CanvasStage } from "./CanvasStage";
import { CanvasToolbar } from "./CanvasToolbar";

export function CanvasPreview({ project, step }: { project: Project; step: EditorStep }) {
  return (
    <div className="h-full w-full relative overflow-hidden">
      <CanvasToolbar project={project} />
      <CanvasStage project={project} />
      <div className="absolute bottom-3 left-3 surface-card px-3 py-1.5 text-[10px] text-muted-foreground text-mono z-10">
        {step.toUpperCase()} · {project.nodes.length} nós · {project.camera.length} kf · {project.visualPreset.name}
      </div>
    </div>
  );
}
