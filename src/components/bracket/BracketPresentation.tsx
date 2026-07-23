import { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Project } from "@/lib/types";
import { PresentationShell } from "@/components/shared/PresentationShell";
import { BracketBoard, buildBracket, CompetitorCard, type WinnersMap } from "./BracketBoard";

/**
 * Present-mode step model:
 *   pool → seat → focus:<matchKey> → reveal:<matchKey> → ... → focus:FINAL → reveal:FINAL → CHAMPION
 *
 * The underlying bracket stays at fit-view. When a match is focused, it dims
 * and an overlay pops the two competitors side-by-side over the center. On
 * "reveal", the winner turns green (loser is struck-through) inside the overlay.
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

  // Camera: fit-to-view by default; during a "focus:<matchKey>" step, zoom into
  // that match's position on the board. On "reveal:<matchKey>" (and every other
  // step) we return to the overview so the user sees the bracket progress.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState("translate(0px, 0px) scale(1)");

  const isFocusStep = currentStep.startsWith("focus:");
  const zoomKey = (isFocusStep || currentStep.startsWith("reveal:")) ? focusKey : null;

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
      const fit = Math.min(wrapW / boardW, wrapH / boardH, 1);

      if (zoomKey) {
        const el = board.querySelector<HTMLElement>(`[data-match-key="${zoomKey}"]`);
        if (el) {
          const scale = Math.min(fit * 2.2, 1.6);
          const cx = el.offsetLeft + el.offsetWidth / 2;
          const cy = el.offsetTop + el.offsetHeight / 2;
          const tx = wrapW / 2 - cx * scale;
          const ty = wrapH / 2 - cy * scale;
          setTransform(`translate(${tx}px, ${ty}px) scale(${scale})`);
          return;
        }
      }

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
  }, [effectiveWinners, currentStep, zoomKey]);

  // Reset when project changes.
  useEffect(() => { setIdx(0); }, [project.id]);

  // Resolve the focused match's participants for the overlay.
  const focusedMatch = useMemo(() => {
    if (!focusKey) return null;
    const all = [...fullData.L.rounds.flat(), ...fullData.R.rounds.flat(), fullData.finalMatch];
    return all.find((m) => m.key === focusKey) ?? null;
  }, [focusKey, fullData]);

  const focusWinnerId = focusKey ? effectiveWinners[focusKey] ?? null : null;
  // Overlay stays open through both "focus:" and "reveal:" steps so the winner
  // can visibly turn green inside the modal before we return to the overview.
  const isRevealStep = currentStep.startsWith("reveal:");
  const showOverlay = (isFocusStep || isRevealStep) && !!focusedMatch && !!focusedMatch.a && !!focusedMatch.b;
  const isChampionStep = currentStep === "CHAMPION";
  const showChampionOverlay = isChampionStep && !!fullData.champion;
  const anyOverlay = showOverlay || showChampionOverlay;

  function stateFor(nodeId: string | undefined | null): "idle" | "current" | "winner" | "loser" {
    if (!nodeId) return "idle";
    if (focusWinnerId && nodeId === focusWinnerId) return "winner";
    if (focusWinnerId && nodeId !== focusWinnerId) return "loser";
    return "current";
  }

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
            {/* Bracket (dimmed and blurred while a match/champion overlay is up) */}
            <div
              ref={boardRef}
              className="absolute top-0 left-0 origin-top-left"
              style={{
                transform,
                transition: "transform 900ms cubic-bezier(0.22, 1, 0.36, 1), opacity 400ms ease, filter 400ms ease",
                width: "max-content",
                opacity: anyOverlay ? 0.18 : 1,
                filter: anyOverlay ? "blur(2px)" : "none",
              }}
            >
              <BracketBoard
                competitors={competitors}
                winners={effectiveWinners}
                currentStep={resolvedStep}
                mode="present"
              />
            </div>

            {/* Solid backdrop behind overlay for legibility */}
            <AnimatePresence>
              {anyOverlay && (
                <motion.div
                  key="overlay-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm pointer-events-none"
                />
              )}
            </AnimatePresence>

            {/* Focused match overlay: two large cards side-by-side */}
            <AnimatePresence>
              {showOverlay && focusedMatch?.a && focusedMatch?.b && (
                <motion.div
                  key={focusKey}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                  <div className="flex items-stretch gap-6 max-w-[80%] rounded-2xl bg-neutral-950/85 border border-white/15 shadow-[0_20px_80px_rgba(0,0,0,0.6)] px-8 py-6">
                    <div className="w-[280px]">
                      <CompetitorCard node={focusedMatch.a} state={stateFor(focusedMatch.a.id)} expanded />
                    </div>
                    <div className="self-center text-2xl font-bold uppercase tracking-widest text-amber-300/90">vs</div>
                    <div className="w-[280px]">
                      <CompetitorCard node={focusedMatch.b} state={stateFor(focusedMatch.b.id)} expanded />
                    </div>
                  </div>
                </motion.div>
              )}

              {showChampionOverlay && fullData.champion && (
                <motion.div
                  key="champion-overlay"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 180, damping: 20 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="text-[11px] uppercase tracking-[0.35em] text-amber-200/90">Campeão</div>
                    <div className="w-[340px] rounded-2xl p-4 bg-gradient-to-br from-amber-400/25 to-amber-600/15 border border-amber-300/60 shadow-[0_0_80px_rgba(252,211,77,0.55)]">
                      <CompetitorCard node={fullData.champion} state="winner" expanded />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </PresentationShell>
  );
}
