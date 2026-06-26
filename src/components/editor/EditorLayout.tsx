import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  Mic,
  FileText,
  Layers,
  Square,
  Sparkles,
  Download,
  Film,
} from "lucide-react";
import type { Project } from "@/lib/types";
import { PROJECT_STATUS_LABEL } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { LeftSidebar, type EditorStep } from "./LeftSidebar";
import { CanvasPreview } from "./CanvasPreview";
import { PropertiesPanel } from "./PropertiesPanel";
import { Timeline } from "./Timeline";
import { AudioPanel } from "../audio/AudioPanel";
import { TranscriptPanel } from "../audio/TranscriptPanel";
import { BlocksReview } from "../blocks/BlocksReview";

export const EDITOR_STEPS: { id: EditorStep; label: string; icon: typeof Mic }[] = [
  { id: "audio", label: "Áudio", icon: Mic },
  { id: "transcript", label: "Transcrição", icon: FileText },
  { id: "blocks", label: "Blocos", icon: Layers },
  { id: "canvas", label: "Canvas", icon: Square },
  { id: "sound", label: "Som & SFX", icon: Sparkles },
  { id: "render", label: "Render", icon: Download },
];

export function EditorLayout({ project }: { project: Project }) {
  const [step, setStep] = useState<EditorStep>(
    project.audio ? (project.blocks.length > 0 ? "canvas" : project.transcript ? "blocks" : "transcript") : "audio",
  );

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="h-14 border-b border-border/60 flex items-center px-4 gap-4 bg-sidebar/60 backdrop-blur">
        <Link to="/projects" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition">
          <ChevronLeft className="size-4" />
          <span>Projetos</span>
        </Link>
        <div className="h-6 w-px bg-border" />
        <div className="size-7 rounded-md bg-gradient-to-br from-primary to-accent grid place-items-center">
          <Film className="size-3.5 text-primary-foreground" />
        </div>
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-display text-sm truncate">{project.title}</h1>
          <Badge variant="secondary" className="text-[10px] font-normal">
            {PROJECT_STATUS_LABEL[project.status]}
          </Badge>
        </div>
        <div className="ml-auto flex items-center gap-2 text-mono text-xs text-muted-foreground">
          <span>{project.blocks.length} blocos</span>
          <span>·</span>
          <span>{Math.floor(project.durationSec)}s</span>
        </div>
      </header>

      {/* Main grid */}
      <div className="flex flex-1 min-h-0">
        <LeftSidebar step={step} onStepChange={setStep} project={project} />

        <main className="flex-1 flex flex-col min-w-0 bg-background">
          <div className="flex-1 min-h-0 overflow-auto">
            <StepContent step={step} project={project} />
          </div>
          <Timeline project={project} />
        </main>

        <PropertiesPanel project={project} step={step} />
      </div>
    </div>
  );
}

function StepContent({ step, project }: { step: EditorStep; project: Project }) {
  switch (step) {
    case "audio":
      return <AudioPanel project={project} />;
    case "transcript":
      return <TranscriptPanel project={project} />;
    case "blocks":
      return <BlocksReview project={project} />;
    case "canvas":
    case "sound":
    case "render":
    default:
      return <CanvasPreview project={project} step={step} />;
  }
}
