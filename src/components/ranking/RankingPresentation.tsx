import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import type { MindNode, Project } from "@/lib/types";
import { resolveImage } from "@/lib/imageStorage";
import { PresentationShell } from "@/components/shared/PresentationShell";

function useResolvedImage(node: MindNode | undefined) {
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

/** Compact ranked row (title + optional thumbnail + rank). */
function RankRow({ node, rank, highlight }: { node: MindNode; rank: number; highlight: boolean }) {
  const url = useResolvedImage(node);
  const goldish = rank === 1;
  return (
    <div
      className={`flex items-center gap-4 rounded-xl border p-3 backdrop-blur transition-colors duration-500 ${
        highlight
          ? "border-amber-300 bg-amber-500/15 shadow-[0_0_30px_rgba(252,211,77,0.4)]"
          : "border-white/15 bg-white/[0.04]"
      }`}
    >
      <div className={`text-4xl font-black tabular-nums w-14 text-center ${goldish ? "text-amber-300" : "text-white/85"}`}>
        {rank}
      </div>
      {url ? (
        <div className="size-14 rounded-lg overflow-hidden bg-black/50 shrink-0">
          <img src={url} alt="" className="size-full object-cover" />
        </div>
      ) : null}
      <div className="text-lg font-medium text-white/95 flex-1 line-clamp-2">{node.text || "Item"}</div>
    </div>
  );
}

/** Compact pool card (bottom strip, all items visible from the start). */
function PoolCard({ node, called }: { node: MindNode; called: boolean }) {
  const url = useResolvedImage(node);
  return (
    <div
      className={`w-[130px] shrink-0 rounded-lg border p-2 flex flex-col items-center gap-1.5 transition-all duration-500 ${
        called
          ? "border-white/10 bg-white/[0.02] opacity-30 grayscale"
          : "border-white/20 bg-white/[0.05]"
      }`}
    >
      <div className="size-14 rounded-md bg-black/40 overflow-hidden grid place-items-center">
        {url ? <img src={url} alt="" className="size-full object-cover" />
          : <span className="text-[10px] text-white/50 px-1 text-center line-clamp-2">{node.text}</span>}
      </div>
      <div className="text-[11px] text-white/80 text-center line-clamp-2 leading-tight">{node.text || "—"}</div>
    </div>
  );
}

/** Big expanded card shown briefly when an item is called. */
function SpotlightCard({ node, targetRank }: { node: MindNode; targetRank: number | undefined }) {
  const url = useResolvedImage(node);
  const body = (node.body || "").trim();
  const hasImage = !!url;
  return (
    <div className="w-[min(560px,80vw)] rounded-2xl overflow-hidden border border-amber-300/60 bg-neutral-950/95 shadow-[0_20px_80px_rgba(252,211,77,0.35)]">
      {hasImage ? (
        <div className="w-full aspect-[16/10] bg-black/70 grid place-items-center overflow-hidden">
          <img src={url!} alt="" className="size-full object-contain" />
        </div>
      ) : null}
      <div className="px-6 py-5 flex flex-col items-center gap-3 text-center">
        <div className="text-[11px] uppercase tracking-[0.35em] text-amber-200/90">
          {typeof targetRank === "number" ? `Posição ${targetRank}` : "Chamada"}
        </div>
        <div className={`font-bold leading-tight text-white ${hasImage ? "text-2xl" : "text-3xl"}`}>
          {node.text || "Item"}
        </div>
        {body && (
          <p className="text-sm leading-relaxed text-white/75 max-w-[46ch] whitespace-pre-wrap">
            {body}
          </p>
        )}
      </div>
    </div>
  );
}

export function RankingPresentation({
  project, recording = false,
}: { project: Project; recording?: boolean }) {
  const root = project.nodes.find((n) => n.role === "ranking" || !n.parentId);
  // Call-order sequence (sorted by `order`), matches editor drag order.
  const callOrder = useMemo(
    () => project.nodes
      .filter((n) => n.role === "item" && n.parentId === root?.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [project.nodes, root?.id],
  );

  // Fill missing ranks deterministically (any node without an explicit rank
  // gets pushed to the end in call order) so the presentation never crashes.
  const rankOf = useMemo(() => {
    const map = new Map<string, number>();
    const used = new Set<number>();
    callOrder.forEach((n) => {
      if (typeof n.rank === "number") { map.set(n.id, n.rank); used.add(n.rank); }
    });
    let next = 1;
    callOrder.forEach((n) => {
      if (map.has(n.id)) return;
      while (used.has(next)) next++;
      map.set(n.id, next); used.add(next); next++;
    });
    return map;
  }, [callOrder]);

  // idx = number of items already called (0..N). Each "next" reveals one.
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [project.id]);

  // Spotlight: the just-called item is shown big for a moment, then joins
  // the ranked list. Duration matches the layout animation window.
  const SPOTLIGHT_MS = 1600;
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const spotlightTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (spotlightTimer.current) window.clearTimeout(spotlightTimer.current);
  }, []);

  function goNext() {
    if (idx >= callOrder.length) return;
    const next = callOrder[idx];
    setIdx(idx + 1);
    if (next) {
      setSpotlightId(next.id);
      if (spotlightTimer.current) window.clearTimeout(spotlightTimer.current);
      spotlightTimer.current = window.setTimeout(() => setSpotlightId(null), SPOTLIGHT_MS);
    }
  }

  function goPrev() {
    if (idx <= 0) return;
    setIdx(idx - 1);
    setSpotlightId(null);
    if (spotlightTimer.current) window.clearTimeout(spotlightTimer.current);
  }

  const calledSet = useMemo(() => new Set(callOrder.slice(0, idx).map((n) => n.id)), [callOrder, idx]);
  // Revealed items sorted by their absolute rank — this drives the leapfrog effect.
  const revealed = useMemo(
    () => callOrder
      .filter((n) => calledSet.has(n.id))
      .sort((a, b) => (rankOf.get(a.id) ?? 999) - (rankOf.get(b.id) ?? 999)),
    [callOrder, calledSet, rankOf],
  );

  const spotlightNode = spotlightId ? callOrder.find((n) => n.id === spotlightId) ?? null : null;

  const navLabel = callOrder.length > 0 ? `${idx} / ${callOrder.length}` : "0 / 0";

  return (
    <PresentationShell
      project={project}
      recording={recording}
      navLabel={navLabel}
      onNext={goNext}
      onPrev={goPrev}
      canNext={idx < callOrder.length}
      canPrev={idx > 0}
      frameBg="bg-gradient-to-b from-slate-950 via-neutral-950 to-black"
    >
      {() => (
        <div className="absolute inset-0 flex flex-col p-8">
          <div className="text-3xl font-bold text-center mb-4 opacity-95">{project.title}</div>

          {callOrder.length === 0 ? (
            <div className="flex-1 grid place-items-center text-white/60">
              Adicione itens antes de apresentar.
            </div>
          ) : (
            <>
              {/* Ranked list (grows as items are called). Uses layout animation
                  so a newly-inserted item slides in and pushes rivals as needed. */}
              <div className="flex-1 min-h-0 mx-auto w-full max-w-xl overflow-y-auto">
                <LayoutGroup>
                  <motion.div layout className="flex flex-col gap-2">
                    <AnimatePresence initial={false}>
                      {revealed.map((n, i) => (
                        <motion.div
                          key={n.id}
                          layout
                          initial={{ opacity: 0, scale: 0.9, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ type: "spring", stiffness: 260, damping: 26 }}
                        >
                          <RankRow
                            node={n}
                            rank={i + 1}
                            highlight={n.id === spotlightId}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                </LayoutGroup>
                {revealed.length === 0 && (
                  <div className="grid place-items-center text-white/40 text-sm h-full min-h-[160px]">
                    Pressione → para chamar o primeiro item
                  </div>
                )}
              </div>

              {/* Pool of all competitors (visible from the start, dim once called). */}
              <div className="mt-4 border-t border-white/10 pt-3">
                <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2 text-center">
                  {idx < callOrder.length ? "Aguardando" : "Todos chamados"}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 justify-center flex-wrap">
                  {callOrder.map((n) => (
                    <PoolCard key={n.id} node={n} called={calledSet.has(n.id)} />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Spotlight overlay: expanded card while the item is being called. */}
          <AnimatePresence>
            {spotlightNode && (
              <>
                <motion.div
                  key="spot-bg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-0 bg-neutral-950/70 backdrop-blur-sm pointer-events-none"
                />
                <motion.div
                  key={`spot-${spotlightNode.id}`}
                  initial={{ opacity: 0, scale: 0.85, y: 40 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -20 }}
                  transition={{ type: "spring", stiffness: 200, damping: 22 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                  <SpotlightCard node={spotlightNode} targetRank={rankOf.get(spotlightNode.id)} />
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      )}
    </PresentationShell>
  );
}
