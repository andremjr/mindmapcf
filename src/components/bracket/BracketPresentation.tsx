import { useMemo, useState } from "react";
import type { MindNode, Project } from "@/lib/types";
import { PresentationShell } from "@/components/shared/PresentationShell";
import { BracketBoard, buildBracket, buildBracketSteps, type WinnersMap } from "./BracketBoard";

export function BracketPresentation({
  project, recording = false,
}: { project: Project; recording?: boolean }) {
  const root = project.nodes.find((n) => n.role === "bracket" || !n.parentId);
  const competitors = useMemo(
    () => project.nodes
      .filter((n) => n.role === "item" && n.parentId === root?.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [project.nodes, root?.id],
  );
  const winners: WinnersMap = useMemo(() => {
    try { return root?.body ? JSON.parse(root.body) : {}; } catch { return {}; }
  }, [root?.body]);
  const data = useMemo(() => buildBracket(competitors, winners), [competitors, winners]);
  const steps = useMemo(() => buildBracketSteps(data), [data]);
  const [idx, setIdx] = useState(0);
  const currentStep = steps[idx] ?? "pool";
  const stepLabel = (() => {
    if (currentStep === "pool") return "Competidores";
    if (currentStep === "seat") return "Chaveamento inicial";
    if (currentStep === "FINAL") return "Final";
    if (currentStep === "CHAMPION") return "Campeão";
    const m = currentStep.match(/^([LR])-r(\d+)i(\d+)$/);
    if (m) {
      const side = m[1] === "L" ? "Esquerda" : "Direita";
      const round = parseInt(m[2], 10) + 1;
      return `${side} — Rodada ${round}`;
    }
    return "";
  })();

  return (
    <PresentationShell
      project={project}
      recording={recording}
      navLabel={`${Math.min(idx + 1, steps.length)} / ${steps.length}`}
      onNext={() => setIdx((i) => Math.min(steps.length - 1, i + 1))}
      onPrev={() => setIdx((i) => Math.max(0, i - 1))}
      canNext={idx < steps.length - 1}
      canPrev={idx > 0}
      frameBg="bg-gradient-to-br from-neutral-950 via-slate-900 to-neutral-950"
    >
      {() => (
        <div className="absolute inset-0 flex flex-col p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xl font-bold opacity-90">{project.title}</div>
            <div className="text-[11px] uppercase tracking-widest text-white/50">{stepLabel}</div>
          </div>
          <div className="flex-1 min-h-0 relative">
            <BracketBoard
              competitors={competitors}
              winners={winners}
              currentStep={currentStep}
              mode="present"
            />
          </div>
        </div>
      )}
    </PresentationShell>
  );
}
