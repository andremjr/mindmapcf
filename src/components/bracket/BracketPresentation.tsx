import { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { MindNode, Project } from "@/lib/types";
import { useStore } from "@/lib/store";
import { PresentationShell } from "@/components/shared/PresentationShell";
import { AvatarLayer } from "@/components/shared/AvatarLayer";
import { PanZoom } from "@/components/ui/PanZoom";
import {
  BracketBoard,
  buildBracket,
  clearDownstreamWinners,
  CompetitorCard,
  type WinnersMap,
} from "./BracketBoard";
import { parseBracketConfig, serializeBracketConfig, seatCompetitors, drawSeedOrder } from "@/lib/bracketConfig";
import { Button } from "@/components/ui/button";
import { Shuffle } from "lucide-react";


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
      if (lm && !lm.isBye) { steps.push(`focus:${lm.key}`); steps.push(`reveal:${lm.key}`); steps.push(`overview:${lm.key}`); }
      if (rm && !rm.isBye) { steps.push(`focus:${rm.key}`); steps.push(`reveal:${rm.key}`); steps.push(`overview:${rm.key}`); }
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
  const rawCompetitors = useMemo(
    () => project.nodes
      .filter((n) => n.role === "item" && n.parentId === root?.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [project.nodes, root?.id],
  );
  const cfg = useMemo(() => parseBracketConfig(root?.body), [root?.body]);
  const winners: WinnersMap = cfg.winners;
  const itemAspect = cfg.itemAspect;
  const accentColor = cfg.accentColor;
  const competitors = useMemo(
    () => seatCompetitors(rawCompetitors, cfg.seedOrder),
    [rawCompetitors, cfg.seedOrder],
  );
  const hasDraw = !!cfg.seedOrder && cfg.seedOrder.length > 0;
  const updateNode = useStore((s) => s.updateNode);


  /** Manual mode locked at mount: no winners pre-picked → author decides live. */
  const manualMode = useState<boolean>(() => {
    if (rawCompetitors.length < 2) return false;
    return Object.keys(parseBracketConfig(root?.body).winners).length === 0;
  })[0];
  function pickWinnerLive(matchKey: string, id: string) {
    if (!root) return;
    const next = clearDownstreamWinners(competitors, { ...winners, [matchKey]: id }, matchKey);
    updateNode(project.id, root.id, {
      body: serializeBracketConfig({ ...cfg, winners: next }),
    } as Partial<MindNode>);
  }


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

  const sideRoundsCount = Math.max(fullData.L.rounds.length, fullData.R.rounds.length);
  function roundLabelFor(key: string | null): string {
    if (!key) return "";
    if (key === "FINAL") return "Final";
    const m = key.match(/^([LR])-r(\d+)i(\d+)$/);
    if (!m) return "";
    const r = parseInt(m[2], 10);
    const fromEnd = sideRoundsCount - 1 - r; // 0 = semifinal, 1 = quartas...
    if (fromEnd === 0) return "Semifinal";
    if (fromEnd === 1) return "Quartas de final";
    if (fromEnd === 2) return "Oitavas de final";
    if (fromEnd === 3) return "16-avos de final";
    return `Rodada ${r + 1}`;
  }

  // Match counter within a round: e.g. Oitavas → "1 de 8", "2 de 8", ...
  // Uses the presentation step order (L then R per match slot) so the numbering
  // matches the sequence the viewer actually sees.
  function matchCounterFor(key: string | null): { current: number; total: number } | null {
    if (!key) return null;
    if (key === "FINAL") return { current: 1, total: 1 };
    const m = key.match(/^([LR])-r(\d+)i(\d+)$/);
    if (!m) return null;
    const r = parseInt(m[2], 10);
    const roundKeys: string[] = [];
    const li = fullData.L.rounds[r]?.length ?? 0;
    const ri = fullData.R.rounds[r]?.length ?? 0;
    const maxI = Math.max(li, ri);
    for (let i = 0; i < maxI; i++) {
      const lm = fullData.L.rounds[r]?.[i];
      const rm = fullData.R.rounds[r]?.[i];
      if (lm && !lm.isBye) roundKeys.push(lm.key);
      if (rm && !rm.isBye) roundKeys.push(rm.key);
    }
    const idxInRound = roundKeys.indexOf(key);
    if (idxInRound < 0) return null;
    return { current: idxInRound + 1, total: roundKeys.length };
  }

  const stepLabel = (() => {
    if (currentStep === "pool") return "Competidores";
    if (currentStep === "seat") return "Chaveamento inicial";
    if (currentStep === "CHAMPION") return "Campeão";
    if (currentStep.startsWith("overview:")) return "Visão geral";
    if (focusKey === "FINAL") return "Final";
    const m = focusKey?.match(/^([LR])-r(\d+)i(\d+)$/);
    if (m) {
      const side = m[1] === "L" ? "Esquerda" : "Direita";
      const matchNum = parseInt(m[3], 10) + 1;
      return `${side} · ${roundLabelFor(focusKey)} · Confronto ${matchNum}`;
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

  if (manualMode) {
    return (
      <ManualBracketStage
        project={project}
        recording={recording}
        rawCompetitors={rawCompetitors}
        seatedCompetitors={competitors}
        cfg={cfg}
        winners={winners}
        itemAspect={itemAspect}
        accentColor={accentColor}
        hasDraw={hasDraw}
        onPickWinner={pickWinnerLive}
        onCommitSeedOrder={(seedOrder) => {
          if (!root) return;
          updateNode(project.id, root.id, {
            body: serializeBracketConfig({ ...cfg, seedOrder, winners: {} }),
          } as Partial<MindNode>);
        }}
      />
    );
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
      frameBg="bg-background"
    >

      {({ size }) => (
        <div className="absolute inset-0 flex flex-col p-5">
          <AvatarLayer project={project} frameSize={size} />
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
                aspect={itemAspect}
                accentColor={accentColor}
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
                  <div className="flex flex-col items-center gap-3 max-w-[80%] rounded-2xl bg-neutral-950/85 border border-white/15 shadow-[0_20px_80px_rgba(0,0,0,0.6)] px-8 py-6">
                    <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.35em]" style={{ color: `${accentColor}e6` }}>
                      <span>{roundLabelFor(focusKey)}</span>
                      {(() => {
                        const c = matchCounterFor(focusKey);
                        return c ? (
                          <>
                            <span className="opacity-40">·</span>
                            <span className="tabular-nums text-white/70">{c.current} de {c.total}</span>
                          </>
                        ) : null;
                      })()}
                    </div>
                    <div className="flex items-stretch gap-6">
                      <motion.div
                        className="w-[280px]"
                        animate={
                          stateFor(focusedMatch.a.id) === "winner"
                            ? { scale: [1, 1.08, 1.04], filter: ["drop-shadow(0 0 0 rgba(52,211,153,0))", "drop-shadow(0 0 24px rgba(52,211,153,0.9))", "drop-shadow(0 0 14px rgba(52,211,153,0.55))"] }
                            : stateFor(focusedMatch.a.id) === "loser"
                              ? { scale: 0.94, opacity: 0.55 }
                              : { scale: 1, opacity: 1 }
                        }
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <CompetitorCard node={focusedMatch.a} state={stateFor(focusedMatch.a.id)} expanded aspect={itemAspect} accentColor={accentColor} />
                      </motion.div>
                      <div className="self-center text-2xl font-bold uppercase tracking-widest" style={{ color: `${accentColor}e6` }}>vs</div>
                      <motion.div
                        className="w-[280px]"
                        animate={
                          stateFor(focusedMatch.b.id) === "winner"
                            ? { scale: [1, 1.08, 1.04], filter: ["drop-shadow(0 0 0 rgba(52,211,153,0))", "drop-shadow(0 0 24px rgba(52,211,153,0.9))", "drop-shadow(0 0 14px rgba(52,211,153,0.55))"] }
                            : stateFor(focusedMatch.b.id) === "loser"
                              ? { scale: 0.94, opacity: 0.55 }
                              : { scale: 1, opacity: 1 }
                        }
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <CompetitorCard node={focusedMatch.b} state={stateFor(focusedMatch.b.id)} expanded aspect={itemAspect} accentColor={accentColor} />
                      </motion.div>
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
                    <div className="text-[11px] uppercase tracking-[0.35em]" style={{ color: `${accentColor}e6` }}>Campeão</div>
                    <div
                      className="w-[340px] rounded-2xl p-4"
                      style={{
                        background: `linear-gradient(to bottom right, ${accentColor}40, ${accentColor}26)`,
                        border: `1px solid ${accentColor}99`,
                        boxShadow: `0 0 80px ${accentColor}8c`,
                      }}
                    >
                      <CompetitorCard node={fullData.champion} state="winner" expanded aspect={itemAspect} accentColor={accentColor} />

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


/**
 * Manual-mode stage. Mirrors automatic mode's first frame (empty bracket +
 * competitors pool at bottom), then on "Sortear" runs a rapid shuffle
 * animation, commits the seed, and drops into a click-to-decide flow: each
 * unresolved match is clickable, opens the same vs modal used in auto mode,
 * the author picks a winner (green reveal), the modal closes, and the
 * bracket updates for the next confrontation.
 */
function ManualBracketStage({
  project,
  recording,
  rawCompetitors,
  seatedCompetitors,
  cfg,
  winners,
  itemAspect,
  accentColor,
  onPickWinner,
  onCommitSeedOrder,
}: {
  project: Project;
  recording: boolean;
  rawCompetitors: MindNode[];
  seatedCompetitors: MindNode[];
  cfg: ReturnType<typeof parseBracketConfig>;
  winners: WinnersMap;
  itemAspect: ReturnType<typeof parseBracketConfig>["itemAspect"];
  accentColor: string;
  hasDraw: boolean;
  onPickWinner: (matchKey: string, id: string) => void;
  onCommitSeedOrder: (seedOrder: string[]) => void;
}) {
  // phase drives what the viewer sees. We always start on "pool" so the first
  // frame matches automatic mode (empty bracket + competitors listed below).
  type Phase = "pool" | "drawing" | "seated" | `focus:${string}` | `reveal:${string}` | "champion";
  const [phase, setPhase] = useState<Phase>("pool");
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);

  const isFocus = phase.startsWith("focus:");
  const isReveal = phase.startsWith("reveal:");
  const focusKey = isFocus ? phase.slice(6) : isReveal ? phase.slice(7) : null;

  // Competitors currently shown on the board: during draw we swap in the
  // ephemeral shuffle preview so the bracket "rolls" through orderings.
  const boardCompetitors = useMemo(() => {
    if (previewOrder) {
      const byId = new Map(rawCompetitors.map((c) => [c.id, c] as const));
      const arr = previewOrder.map((id) => byId.get(id)).filter((x): x is MindNode => !!x);
      return arr.length ? arr : rawCompetitors;
    }
    return seatedCompetitors;
  }, [previewOrder, rawCompetitors, seatedCompetitors]);

  const fullData = useMemo(() => buildBracket(boardCompetitors, winners), [boardCompetitors, winners]);

  // Hide the just-picked winner from the board while the focus modal is open
  // (author sees the modal reveal first, then the board updates).
  const effectiveWinners = useMemo<WinnersMap>(() => {
    if (isFocus && focusKey && winners[focusKey]) {
      const { [focusKey]: _drop, ...rest } = winners;
      return rest;
    }
    return winners;
  }, [winners, isFocus, focusKey]);

  const focusedMatch = useMemo(() => {
    if (!focusKey) return null;
    const all = [...fullData.L.rounds.flat(), ...fullData.R.rounds.flat(), fullData.finalMatch];
    return all.find((m) => m.key === focusKey) ?? null;
  }, [focusKey, fullData]);
  const focusWinnerId = focusKey && isReveal ? winners[focusKey] ?? null : null;

  const anyOverlay = (isFocus || isReveal) && !!focusedMatch?.a && !!focusedMatch?.b;
  const showChampionOverlay = phase === "champion" && !!fullData.champion;

  function stateFor(nodeId: string | undefined | null): "idle" | "current" | "winner" | "loser" {
    if (!nodeId) return "idle";
    if (focusWinnerId && nodeId === focusWinnerId) return "winner";
    if (focusWinnerId && nodeId !== focusWinnerId) return "loser";
    return "current";
  }

  // Auto-advance to champion once the final is decided.
  useEffect(() => {
    if (phase === "seated" && fullData.champion) setPhase("champion");
  }, [phase, fullData.champion]);

  // ---- Draw animation ----
  function startDraw() {
    if (phase !== "pool" || rawCompetitors.length < 2) return;
    setPhase("drawing");
    const start = performance.now();
    const DURATION = 1600;
    const tick = () => {
      const t = performance.now() - start;
      if (t >= DURATION) {
        const finalOrder = drawSeedOrder(rawCompetitors);
        setPreviewOrder(finalOrder);
        onCommitSeedOrder(finalOrder);
        window.setTimeout(() => {
          setPreviewOrder(null);
          setPhase("seated");
        }, 650);
        return;
      }
      setPreviewOrder(drawSeedOrder(rawCompetitors));
      window.setTimeout(tick, 90);
    };
    tick();
  }

  // ---- Click handlers ----
  function handleMatchClick(key: string) {
    if (phase !== "seated") return;
    if (winners[key]) return;
    setPhase(`focus:${key}` as Phase);
  }
  function handlePickWinner(id: string) {
    if (!isFocus || !focusKey) return;
    onPickWinner(focusKey, id);
    setPhase(`reveal:${focusKey}` as Phase);
    window.setTimeout(() => {
      setPhase("seated");
    }, 1500);
  }

  // ---- Camera (identical fit-view logic to auto mode) ----
  const wrapperRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState("translate(0px, 0px) scale(1)");
  const zoomKey = focusKey;

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
      // Reserve room for the pool row while it's shown.
      const reserved = phase === "pool" || phase === "drawing" ? Math.min(220, wrapH * 0.3) : 0;
      const availH = Math.max(120, wrapH - reserved);
      const fit = Math.min(wrapW / boardW, availH / boardH, 1);

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
      const ty = (availH - boardH * fit) / 2;
      setTransform(`translate(${tx}px, ${ty}px) scale(${fit})`);
    }
    recalc();
    const ro = new ResizeObserver(recalc);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    if (boardRef.current) ro.observe(boardRef.current);
    window.addEventListener("resize", recalc);
    return () => { ro.disconnect(); window.removeEventListener("resize", recalc); };
  }, [effectiveWinners, phase, zoomKey, boardCompetitors]);

  // Board "currentStep" prop: drives progressive reveal + current highlight.
  const currentStepForBoard: string =
    phase === "pool" || phase === "drawing"
      ? "pool"
      : focusKey ?? "";

  const stepLabel =
    phase === "pool"
      ? "Competidores"
      : phase === "drawing"
        ? "Sorteando confrontos…"
        : phase === "champion"
          ? "Campeão"
          : isFocus || isReveal
            ? "Modo manual — escolha o vencedor"
            : "Modo manual — clique em um confronto";

  return (
    <PresentationShell
      project={project}
      recording={recording}
      navLabel="Manual"
      onNext={() => {}}
      onPrev={() => {}}
      canNext={false}
      canPrev={false}
      frameBg="bg-background"
    >
      {({ size }) => (
        <div className="absolute inset-0 flex flex-col p-5">
          <AvatarLayer project={project} frameSize={size} />
          <div className="flex items-center justify-between mb-2">
            <div className="text-xl font-bold opacity-90">{project.title}</div>
            <div className="text-[11px] uppercase tracking-widest text-white/50">{stepLabel}</div>
          </div>

          <div ref={wrapperRef} className="flex-1 min-h-0 relative overflow-hidden">
            {/* Bracket, fit-to-view */}
            <div
              ref={boardRef}
              className="absolute top-0 left-0 origin-top-left"
              style={{
                transform,
                transition: "transform 900ms cubic-bezier(0.22, 1, 0.36, 1), opacity 400ms ease, filter 400ms ease",
                width: "max-content",
                opacity: anyOverlay || showChampionOverlay ? 0.18 : 1,
                filter: anyOverlay || showChampionOverlay ? "blur(2px)" : "none",
              }}
            >
              <BracketBoard
                competitors={boardCompetitors}
                winners={effectiveWinners}
                currentStep={currentStepForBoard}
                mode="present"
                aspect={itemAspect}
                accentColor={accentColor}
                onMatchClick={phase === "seated" ? handleMatchClick : undefined}
              />
            </div>

            {/* Sortear CTA — sits over the empty bracket during pool phase */}
            <AnimatePresence>
              {phase === "pool" && (
                <motion.div
                  key="sortear-cta"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none"
                >
                  <div className="flex flex-col items-center gap-4 pointer-events-auto rounded-2xl bg-neutral-950/70 backdrop-blur px-8 py-6 border border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.6)]">
                    <div className="text-sm text-white/70 text-center max-w-sm">
                      {rawCompetitors.length} competidores prontos para o sorteio das chaves iniciais.
                    </div>
                    <Button
                      size="lg"
                      onClick={startDraw}
                      className="gap-2"
                      style={{ background: accentColor, color: "#0a0a0a" }}
                    >
                      <Shuffle className="size-4" /> Sortear agora
                    </Button>
                  </div>
                </motion.div>
              )}
              {phase === "drawing" && (
                <motion.div
                  key="drawing-badge"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                    className="grid place-items-center size-16 rounded-full border bg-neutral-950/70 backdrop-blur"
                    style={{ borderColor: `${accentColor}aa`, boxShadow: `0 0 60px ${accentColor}88` }}
                  >
                    <Shuffle className="size-7" style={{ color: accentColor }} />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Overlay backdrop for focus / champion */}
            <AnimatePresence>
              {(anyOverlay || showChampionOverlay) && (
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

            {/* Focus overlay — clickable cards to pick winner */}
            <AnimatePresence>
              {anyOverlay && focusedMatch?.a && focusedMatch?.b && (
                <motion.div
                  key={focusKey}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <div className="flex flex-col items-center gap-4 max-w-[80%] rounded-2xl bg-neutral-950/85 border border-white/15 shadow-[0_20px_80px_rgba(0,0,0,0.6)] px-8 py-6 pointer-events-auto">
                    <div className="text-[11px] uppercase tracking-[0.35em]" style={{ color: `${accentColor}e6` }}>
                      {focusKey === "FINAL" ? "Final" : "Confronto"}
                    </div>
                    <div className="flex items-stretch gap-6">
                      {[focusedMatch.a, focusedMatch.b].map((n, i) => (
                        <motion.button
                          key={n!.id}
                          type="button"
                          disabled={isReveal}
                          onClick={() => handlePickWinner(n!.id)}
                          className="w-[280px] text-left disabled:cursor-default"
                          animate={
                            stateFor(n!.id) === "winner"
                              ? { scale: [1, 1.08, 1.04], filter: ["drop-shadow(0 0 0 rgba(52,211,153,0))", "drop-shadow(0 0 24px rgba(52,211,153,0.9))", "drop-shadow(0 0 14px rgba(52,211,153,0.55))"] }
                              : stateFor(n!.id) === "loser"
                                ? { scale: 0.94, opacity: 0.55 }
                                : { scale: 1, opacity: 1 }
                          }
                          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                          whileHover={!isReveal ? { scale: 1.03 } : undefined}
                        >
                          <CompetitorCard
                            node={n!}
                            state={stateFor(n!.id)}
                            expanded
                            aspect={itemAspect}
                            accentColor={accentColor}
                          />
                          {!isReveal && (
                            <div className="mt-2 text-center text-[11px] uppercase tracking-[0.3em] text-white/50">
                              Clique para eleger
                            </div>
                          )}
                          {i === 0 && null}
                        </motion.button>
                      ))}
                    </div>
                    {!isReveal && (
                      <div className="text-xs text-white/40">Clique em um competidor para decidir o confronto</div>
                    )}
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
                    <div className="text-[11px] uppercase tracking-[0.35em]" style={{ color: `${accentColor}e6` }}>Campeão</div>
                    <div
                      className="w-[340px] rounded-2xl p-4"
                      style={{
                        background: `linear-gradient(to bottom right, ${accentColor}40, ${accentColor}26)`,
                        border: `1px solid ${accentColor}99`,
                        boxShadow: `0 0 80px ${accentColor}8c`,
                      }}
                    >
                      <CompetitorCard node={fullData.champion} state="winner" expanded aspect={itemAspect} accentColor={accentColor} />
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

