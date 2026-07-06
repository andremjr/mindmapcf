import { useState } from "react";
import type { Project } from "@/lib/types";
import type { EditorStep } from "./LeftSidebar";
import { CanvasStage } from "./CanvasStage";
import { CanvasToolbar } from "./CanvasToolbar";

export function CanvasPreview({ project, step }: { project: Project; step: EditorStep }) {
  const [debug, setDebug] = useState(false);
  return (
    <div className="h-full w-full relative overflow-hidden">
      <CanvasToolbar project={project} debug={debug} onToggleDebug={() => setDebug((d) => !d)} />
      <CanvasStage project={project} debug={debug} />
      <div className="absolute bottom-3 left-3 surface-card px-3 py-1.5 text-[10px] text-muted-foreground text-mono z-10">
        {step.toUpperCase()} · {project.nodes.length} nós · {(project.chapters?.length ?? 0)} caps · {project.camera.length} kf · {project.visualPreset.name}
      </div>
    </div>
  );
}
