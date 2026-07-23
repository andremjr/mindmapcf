import { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import type { MindNode, Project } from "@/lib/types";
import { PresentationShell } from "@/components/shared/PresentationShell";
import { BracketBoard, buildBracket, type WinnersMap } from "./BracketBoard";

/**
 * Present-mode step model:
 *   pool → seat → focus:<matchKey> → reveal:<matchKey> → ... → focus:FINAL → reveal:FINAL → CHAMPION
 *
 * The camera zooms to the currently focused match. On "reveal", the winner is
 * disclosed (loser strike-through, winner green) while the camera stays; the
 * next step moves the camera to the following match.
 *
 * Match order alternates sides: L r0 i0 → R r0 i0 → L r0 i1 → R r0 i1 → ...
 * so viewers watch left/right in tandem before advancing to the next round.
 */
function buildPresentSteps(data: ReturnType<typeof buildBracket>): string[] {
  const steps: string[] = ["pool", "seat"];
  const maxR = Math.max(data.L.rounds.length, data.R.rounds.length);
  for (let r = 0; r < maxR; r++) {
    const li = data.L.rounds[r]?.length ?? 0;
    const ri = data.R.rounds[r]?.length ?? 0;
    const maxI = Math.max(li, ri);
    for (let i = 0; i < maxI; i++) {
      const lm = data.L.rounds[r]?.[i];
      const rm = data.R.rounds[r]?.[i];
      if (lm && !lm.isBye) { steps.push(`focus:${lm.key}`); steps.push(`reveal:${lm.key}`); }
      if (rm && !rm.isBye) { steps.push(`focus:${rm.key}`); steps.push(`reveal:${rm.key}`); }
    }
  }
  if (!data.finalMatch.isBye) {
    steps.push("focus:FINAL");
    steps.push("reveal:FINAL");
  }
  if (data.champion || !data.finalMatch.isBye) steps.push("CHAMPION");
  return steps;
}

function offsetInside(el: HTMLElement, root: HTMLElement) {
  let x = 0, y = 0;
  let cur: HTMLElement | null = el;
  while (cur && cur !== root && root.contains(cur)) {
    x += cur.offsetLeft;
    y += cur.offsetTop;
    cur = cur.offsetParent as HTMLElement | null;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

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

  // Full bracket used purely to enumerate the step order (all winners applied).
  const fullData = useMemo(() => buildBracket(competitors, winners), [competitors, winners]);
  const steps = useMemo(() => buildPresentSteps(fullData), [fullData]);

  const [idx, setIdx] = useState(0);
  const currentStep = steps[idx] ?? "pool";

  // Winners that have already been "revealed" up to the current step.
  const effectiveWinners = useMemo<WinnersMap>(() => {
    const revealed = new Set<string>();
    for (let i = 0; i <= idx; i++) {
      const s = steps[i];
      if (s?.startsWith("reveal:")) revealed.add(s.slice(7));
    }
    const out: WinnersMap = {};
    for (const [k, v] of Object.entries(winners)) if (revealed.has(k)) out[k] = v;
    return out;
  }, [idx, steps, winners]);

  const focusKey = currentStep.startsWith("focus:")
    ? currentStep.slice(6)
    : currentStep.startsWith("reveal:")
      ? currentStep.slice(7)
      : null;

  // Resolved key passed to BracketBoard (drives the amber "current" highlight).
  const resolvedStep = focusKey ?? currentStep;

  const stepLabel = (() => {
    if (currentStep === "pool") return "Competidores";
    if (currentStep === "seat") return "Chaveamento inicial";
    if (focusKey === "FINAL") return "Final";
    if (currentStep === "CHAMPION") return "Campeão";
    const m = focusKey?.match(/^([LR])-r(\d+)i(\d+)$/);
    if (m) {
      const side = m[1] === "L" ? "Esquerda" : "Direita";
      const round = parseInt(m[2], 10) + 1;
      const matchNum = parseInt(m[3], 10) + 1;
      return `${side} · Rodada ${round} · Confronto ${matchNum}`;
    }
    return "";
  })();

  // Camera transform: zoom-fit by default, zoom to focused match when focusKey is set.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState("translate(0px, 0px) scale(1)");

  useLayoutEffect(() => {
    function recalc() {
      const wrap = wrapperRef.current;
      const board = boardRef.current;
      if (!wrap || !board) return;
      const wrapW = wrap.clientWidth;
      const wrapH = wrap.clientHeight;
      const boardW = board.scrollWidth;
      const boardH = board.scrollHeight;
      if (!wrapW || !wrapH || !boardW || !boardH) return;

      if (focusKey) {
        const el = board.querySelector<HTMLElement>(`[data-match-key="${CSS.escape(focusKey)}"]`);
        if (el) {
          const pos = offsetInside(el, board);
          const scale = focusKey === "FINAL" ? 1.9 : 2.1;
          const cx = pos.x + pos.w / 2;
          const cy = pos.y + pos.h / 2;
          const tx = wrapW / 2 - cx * scale;
          const ty = wrapH / 2 - cy * scale;
          setTransform(`translate(${tx}px, ${ty}px) scale(${scale})`);
          return;
        }
      }
      // Fit-to-view for pool/seat/CHAMPION (or if focus target not yet mounted).
      const fit = Math.min(wrapW / boardW, wrapH / boardH, 1);
      const tx = (wrapW - boardW * fit) / 2;
      const ty = (wrapH - boardH * fit) / 2;
      setTransform(`translate(${tx}px, ${ty}px) scale(${fit})`);
    }
    recalc();
    const ro = new ResizeObserver(recalc);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    if (boardRef.current) ro.observe(boardRef.current);
    window.addEventListener("resize", recalc);
    return () => { ro.disconnect(); window.removeEventListener("resize", recalc); };
  }, [focusKey, effectiveWinners, currentStep]);

  // Reset when project changes.
  useEffect(() => { setIdx(0); }, [project.id]);

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
          <div ref={wrapperRef} className="flex-1 min-h-0 relative overflow-hidden">
            <div
              ref={boardRef}
              className="absolute top-0 left-0 origin-top-left"
              style={{
                transform,
                transition: "transform 900ms cubic-bezier(0.22, 1, 0.36, 1)",
                width: "max-content",
              }}
            >
              <BracketBoard
                competitors={competitors}
                winners={effectiveWinners}
                currentStep={resolvedStep}
                mode="present"
              />
            </div>
          </div>
        </div>
      )}
    </PresentationShell>
  );
}
