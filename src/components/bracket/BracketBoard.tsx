/**
 * Shared bracket rendering used by both editor (pick winners) and presentation
 * (animated reveal). Renders a two-sided (World-Cup style) bracket that
 * converges to a central FINAL match and a champion trophy card.
 */
import { useMemo, useEffect, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { Trophy } from "lucide-react";
import type { MindNode } from "@/lib/types";
import { resolveImage } from "@/lib/imageStorage";

export type WinnersMap = Record<string, string>;

type Match = {
  key: string;
  a: MindNode | null;
  b: MindNode | null;
  winnerId: string | null;
  isBye: boolean;
};

function nextPow2(n: number) { let p = 1; while (p < n) p *= 2; return Math.max(2, p); }

export function buildBracket(competitors: MindNode[], winners: WinnersMap) {
  const size = competitors.length >= 2 ? nextPow2(competitors.length) : 2;
  const seeded: (MindNode | null)[] = Array.from({ length: size }, (_, i) => competitors[i] ?? null);
  const half = size / 2;
  const left = seeded.slice(0, half);
  const right = seeded.slice(half);

  function buildSide(seeds: (MindNode | null)[], side: "L" | "R") {
    const rounds: Match[][] = [];
    let prev: (MindNode | null)[] = seeds;
    let r = 0;
    while (prev.length > 1) {
      const matches: Match[] = [];
      for (let i = 0; i < prev.length; i += 2) {
        const a = prev[i]; const b = prev[i + 1];
        const key = `${side}-r${r}i${i / 2}`;
        const isBye = a === null || b === null;
        let winnerId: string | null = winners[key] ?? null;
        if (isBye) winnerId = a?.id ?? b?.id ?? null;
        matches.push({ key, a, b, winnerId, isBye });
      }
      rounds.push(matches);
      prev = matches.map((m) => (m.winnerId ? competitors.find((c) => c.id === m.winnerId) ?? null : null));
      r++;
    }
    return { rounds, top: prev[0] ?? null };
  }

  const L = buildSide(left, "L");
  const R = buildSide(right, "R");
  const finalWinnerId = winners["FINAL"] ?? null;
  const isFinalReady = L.top !== null && R.top !== null;
  const finalMatch: Match = {
    key: "FINAL",
    a: L.top,
    b: R.top,
    winnerId: finalWinnerId,
    isBye: !isFinalReady,
  };
  const champion = finalWinnerId ? competitors.find((c) => c.id === finalWinnerId) ?? null : null;
  return { L, R, finalMatch, champion, size, half };
}

export type BracketData = ReturnType<typeof buildBracket>;

/** Ordered navigation steps for present mode. */
export function buildBracketSteps(data: BracketData): string[] {
  const steps: string[] = ["pool", "seat"];
  const maxR = Math.max(data.L.rounds.length, data.R.rounds.length);
  for (let r = 0; r < maxR; r++) {
    const li = data.L.rounds[r]?.length ?? 0;
    const ri = data.R.rounds[r]?.length ?? 0;
    const maxI = Math.max(li, ri);
    for (let i = 0; i < maxI; i++) {
      const lm = data.L.rounds[r]?.[i];
      const rm = data.R.rounds[r]?.[i];
      if (lm && !lm.isBye) steps.push(lm.key);
      if (rm && !rm.isBye) steps.push(rm.key);
    }
  }
  if (!data.finalMatch.isBye) steps.push("FINAL");
  if (data.champion || !data.finalMatch.isBye) steps.push("CHAMPION");
  return steps;
}

/** When a downstream match's participants change, its winner should be cleared. */
export function clearDownstreamWinners(
  competitors: MindNode[],
  winners: WinnersMap,
  changedMatchKey: string,
): WinnersMap {
  // Rebuild everything, keeping only winners whose match still has both slots
  // reachable via the current bracket + this new pick.
  const next = { ...winners };
  // Simple heuristic: rebuild bracket with `next`, then any match key that
  // references a nodeId not currently competing gets dropped.
  const data = buildBracket(competitors, next);
  const validKeys = new Set<string>();
  for (const rd of data.L.rounds) for (const m of rd) validKeys.add(m.key);
  for (const rd of data.R.rounds) for (const m of rd) validKeys.add(m.key);
  validKeys.add("FINAL");
  const cleaned: WinnersMap = {};
  for (const [k, v] of Object.entries(next)) {
    if (!validKeys.has(k)) continue;
    // Find the match and ensure v is one of its participants.
    const m = [...data.L.rounds.flat(), ...data.R.rounds.flat(), data.finalMatch].find((x) => x.key === k);
    if (!m) continue;
    if (m.a?.id === v || m.b?.id === v) cleaned[k] = v;
  }
  // Ensure the just-picked match key stays even if participants changed on re-eval
  if (winners[changedMatchKey]) cleaned[changedMatchKey] = winners[changedMatchKey];
  return cleaned;
}

// ------------- Rendering -------------

function useResolvedImage(node: MindNode | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const key = node?.imageRef?.id ?? node?.image ?? "";
  useEffect(() => {
    if (!node) { setUrl(null); return; }
    if (node.image) { setUrl(node.image); return; }
    if (!node.imageRef) { setUrl(null); return; }
    let alive = true;
    resolveImage(node.imageRef).then((u) => alive && setUrl(u));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

function CompetitorCard({
  node, state, onClick, small = false,
}: {
  node: MindNode;
  state: "idle" | "current" | "winner" | "loser";
  onClick?: () => void;
  small?: boolean;
}) {
  const url = useResolvedImage(node);
  const cls =
    state === "winner"
      ? "border-emerald-300 bg-emerald-500/20 shadow-[0_0_18px_rgba(52,211,153,0.4)]"
      : state === "current"
        ? "border-amber-300 bg-amber-400/10 ring-2 ring-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.45)]"
        : state === "loser"
          ? "border-white/10 bg-black/50 opacity-40"
          : "border-white/20 bg-black/60";
  const textCls =
    state === "loser"
      ? "line-through text-white/60"
      : "text-white/95";
  return (
    <button
      disabled={!onClick}
      onClick={onClick}
      className={`relative w-full rounded-md overflow-hidden border transition-all text-left flex flex-col ${cls} ${onClick ? "hover:border-white/70 cursor-pointer" : "cursor-default"}`}
    >
      <div className="w-full aspect-square bg-black/70 grid place-items-center overflow-hidden">
        {url ? (
          <img src={url} alt="" className="size-full object-contain" />
        ) : (
          <span className="text-[10px] text-white/40">sem imagem</span>
        )}
      </div>
      <div className={`px-1.5 py-1.5 font-medium leading-tight line-clamp-3 text-center ${textCls} ${small ? "text-[11px]" : "text-xs"}`}>
        {node.text || "—"}
      </div>
    </button>
  );
}

function EmptySlot({ label = "?" }: { label?: string }) {
  return (
    <div className="w-full rounded-md border border-dashed border-white/15 bg-black/30 grid place-items-center text-[11px] text-white/40 flex-col aspect-[3/4]">
      <div className="flex-1 grid place-items-center w-full">{label}</div>
    </div>
  );
}

function MatchBox({
  match, mode, isCurrent, isRevealed, onPickWinner, side,
}: {
  match: Match;
  mode: "edit" | "present";
  isCurrent: boolean;
  isRevealed: boolean;   // true when both slots are visible
  onPickWinner?: (matchKey: string, id: string) => void;
  side: "L" | "R" | "F";
}) {
  // In present mode, unrevealed matches show empty placeholders.
  // In edit mode, everything is revealed and clickable.
  const showContents = mode === "edit" || isRevealed;

  const winnerId = match.winnerId;
  function stateFor(nodeId: string | undefined): "idle" | "current" | "winner" | "loser" {
    if (!nodeId) return "idle";
    if (winnerId && nodeId === winnerId) return "winner";
    if (winnerId && nodeId !== winnerId) return "loser";
    if (isCurrent) return "current";
    return "idle";
  }
  const canPick = mode === "edit" && match.a && match.b && onPickWinner;

  return (
    <div
      data-match-key={match.key}
      className={`rounded-lg p-1.5 space-y-1 transition-all ${
        isCurrent ? "bg-white/5 ring-1 ring-amber-300/40" : ""
      }`}
    >

      {showContents && match.a ? (
        <motion.div layoutId={`comp-${match.a.id}-at-${match.key}-a`} initial={{ opacity: 0, y: side === "L" ? -6 : side === "R" ? -6 : -6 }} animate={{ opacity: 1, y: 0 }}>
          <CompetitorCard
            node={match.a}
            state={stateFor(match.a.id)}
            onClick={canPick ? () => onPickWinner!(match.key, match.a!.id) : undefined}
          />
        </motion.div>
      ) : (
        <EmptySlot label={match.a ? "?" : match.isBye ? "BYE" : "?"} />
      )}
      <div className="text-center text-[9px] uppercase tracking-wider text-white/40">vs</div>
      {showContents && match.b ? (
        <motion.div layoutId={`comp-${match.b.id}-at-${match.key}-b`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <CompetitorCard
            node={match.b}
            state={stateFor(match.b.id)}
            onClick={canPick ? () => onPickWinner!(match.key, match.b!.id) : undefined}
          />
        </motion.div>
      ) : (
        <EmptySlot label={match.b ? "?" : match.isBye ? "BYE" : "?"} />
      )}
    </div>
  );
}

function RoundColumn({
  round, mode, currentStep, stepIdx, steps, side, onPickWinner, label,
}: {
  round: Match[];
  mode: "edit" | "present";
  currentStep: string | null;
  stepIdx: number;
  steps: string[];
  side: "L" | "R";
  onPickWinner?: (matchKey: string, id: string) => void;
  label: string;
}) {
  const r = parseInt(round[0]?.key.match(/r(\d+)/)?.[1] ?? "0", 10);
  const spacing = 8 * Math.pow(2, r);
  return (
    <div className="flex flex-col gap-2 w-[180px] sm:w-[210px] shrink-0" style={{ paddingTop: spacing, paddingBottom: spacing }}>


      <div className="text-[10px] uppercase tracking-widest text-white/40 text-center">{label}</div>
      <div className="flex-1 flex flex-col justify-around gap-2">
        {round.map((m, i) => {
          const midx = steps.indexOf(m.key);
          // In present mode, participants appear as soon as both slots are filled
          // (progressive disclosure is driven upstream by the winners map that
          // the parent passes in). "pool" step hides everything for a clean intro.
          const revealed =
            mode === "edit"
              ? true
              : m.isBye
                ? true
                : currentStep === "pool"
                  ? false
                  : !!m.a && !!m.b
                    ? true
                    : midx >= 0 && stepIdx >= midx;

          const isCurrent = currentStep === m.key;
          return (
            <div key={m.key} style={{ marginTop: i > 0 ? spacing : 0 }}>
              <MatchBox
                match={m}
                mode={mode}
                isCurrent={isCurrent}
                isRevealed={revealed}
                onPickWinner={onPickWinner}
                side={side}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BracketBoard({
  competitors,
  winners,
  currentStep,
  mode,
  onPickWinner,
}: {
  competitors: MindNode[];
  winners: WinnersMap;
  /** null → edit mode shows everything. In present mode, the current step key. */
  currentStep: string | null;
  mode: "edit" | "present";
  onPickWinner?: (matchKey: string, id: string) => void;
}) {
  const data = useMemo(() => buildBracket(competitors, winners), [competitors, winners]);
  const steps = useMemo(() => buildBracketSteps(data), [data]);
  const stepIdx = mode === "edit" ? steps.length - 1 : currentStep ? steps.indexOf(currentStep) : 0;

  const showPool = mode === "present" && currentStep === "pool";
  const isChampionStep = mode === "present" && currentStep === "CHAMPION";
  const showChampion = mode === "edit" ? !!data.champion : (isChampionStep && !!data.champion);

  const finalMidx = steps.indexOf("FINAL");
  const finalRevealed =
    mode === "edit"
      ? true
      : data.finalMatch.isBye
        ? true
        : currentStep === "pool"
          ? false
          : !!data.finalMatch.a && !!data.finalMatch.b
            ? true
            : finalMidx >= 0 && stepIdx >= finalMidx;

  const finalIsCurrent = currentStep === "FINAL";

  if (competitors.length < 2) {
    return (
      <div className="flex-1 grid place-items-center text-white/60 py-10">
        Adicione pelo menos 2 competidores.
      </div>
    );
  }

  return (
    <LayoutGroup>
      <div className="relative w-full min-h-full flex flex-col">
        {/* Bracket area */}
        <div className={`flex-1 flex items-stretch justify-center gap-3 overflow-auto px-2 transition-opacity ${showPool ? "opacity-30" : "opacity-100"}`}>
          {/* Left side, R1 outermost → R_top innermost */}
          {data.L.rounds.map((rd, r) => (
            <RoundColumn
              key={`L-${r}`}
              round={rd}
              mode={mode}
              currentStep={currentStep}
              stepIdx={stepIdx}
              steps={steps}
              side="L"
              onPickWinner={onPickWinner}
              label={r === data.L.rounds.length - 1 ? "Semifinal" : `Rodada ${r + 1}`}
            />
          ))}

          {/* Center: FINAL + Champion */}
          <div className="flex flex-col items-center justify-center gap-4 w-[210px] sm:w-[240px] shrink-0 py-6">
            <div className="text-[10px] uppercase tracking-widest text-amber-300/80">Final</div>
            <div className="w-full">

              <MatchBox
                match={data.finalMatch}
                mode={mode}
                isCurrent={finalIsCurrent}
                isRevealed={finalRevealed}
                onPickWinner={onPickWinner}
                side="F"
              />
            </div>
            <div className="min-h-[110px] w-full grid place-items-center">
              <AnimatePresence>
                {showChampion && data.champion && (
                  <motion.div
                    key="champion"
                    initial={{ scale: 0.4, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 180, damping: 18 }}
                    className="rounded-xl p-3 bg-gradient-to-br from-amber-400/30 to-amber-600/20 border border-amber-300/60 shadow-[0_0_60px_rgba(252,211,77,0.55)] w-full"
                  >
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-amber-200 mb-1 justify-center">
                      <Trophy className="size-3" /> Campeão
                    </div>
                    <CompetitorCard node={data.champion} state="winner" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right side, mirrored (R_top innermost → R1 outermost) */}
          {[...data.R.rounds].reverse().map((rd, ri) => {
            const r = data.R.rounds.length - 1 - ri;
            return (
              <RoundColumn
                key={`R-${r}`}
                round={data.R.rounds[r]}
                mode={mode}
                currentStep={currentStep}
                stepIdx={stepIdx}
                steps={steps}
                side="R"
                onPickWinner={onPickWinner}
                label={r === data.R.rounds.length - 1 ? "Semifinal" : `Rodada ${r + 1}`}
              />
            );
          })}
        </div>

        {/* Pool row (visible only on 'pool' step in present mode) */}
        <AnimatePresence>
          {showPool && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-4 left-4 right-4 rounded-lg bg-black/60 backdrop-blur border border-white/10 p-3 flex flex-wrap gap-2 justify-center max-h-[35%] overflow-auto"
            >
              {competitors.map((c) => (
                <div key={c.id} className="w-[160px]">
                  <CompetitorCard node={c} state="idle" small />
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
