import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import type { MindNode, Project } from "@/lib/types";
import { resolveImage } from "@/lib/imageStorage";
import { PresentationShell } from "@/components/shared/PresentationShell";

/* ---------- image ---------- */
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

/* ---------- auto-fit grid ---------- */
function useAutoGrid(count: number, aspect = 1) {
  const ref = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setDims({ w: r.width, h: r.height });
    });
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const layout = useMemo(() => {
    const n = Math.max(1, count);
    const { w, h } = dims;
    if (!w || !h) return { cols: 1, rows: n, cellW: 0, cellH: 0 };
    let best = { cols: 1, rows: n, cellW: 0, cellH: 0, area: 0 };
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const cwMax = w / c;
      const chMax = h / r;
      let cw = cwMax, ch = cwMax / aspect;
      if (ch > chMax) { ch = chMax; cw = ch * aspect; }
      const area = cw * ch;
      if (area > best.area) best = { cols: c, rows: r, cellW: cw, cellH: ch, area };
    }
    return best;
  }, [count, dims, aspect]);
  return { ref, ...layout };
}

/* ---------- ranked row ---------- */
function RankRow({
  node, rank, height,
}: { node: MindNode; rank: number; height: number }) {
  const url = useResolvedImage(node);
  const goldish = rank === 1;
  const pad = Math.max(6, Math.min(14, height * 0.14));
  const rankSize = Math.max(18, Math.min(40, height * 0.55));
  const titleSize = Math.max(12, Math.min(20, height * 0.32));
  const thumb = Math.max(28, height - pad * 2);
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-border bg-card/60 backdrop-blur transition-colors duration-500"
      style={{ height, padding: pad }}
    >
      <div
        className={`font-black tabular-nums text-center ${goldish ? "text-amber-500 dark:text-amber-300" : "text-foreground/80"}`}
        style={{ width: rankSize * 1.4, fontSize: rankSize, lineHeight: 1 }}
      >
        {rank}
      </div>
      {url ? (
        <div className="rounded-lg overflow-hidden bg-muted shrink-0" style={{ width: thumb, height: thumb }}>
          <img src={url} alt="" className="size-full object-cover" />
        </div>
      ) : null}
      <div
        className="font-medium text-foreground flex-1 leading-tight line-clamp-2"
        style={{ fontSize: titleSize }}
      >
        {node.text || "Item"}
      </div>
    </div>
  );
}

/* ---------- empty slot ---------- */
function EmptySlot({ rank, height }: { rank: number; height: number }) {
  const rankSize = Math.max(16, Math.min(34, height * 0.5));
  return (
    <div
      className="rounded-xl border border-dashed border-border bg-muted/30 flex items-center"
      style={{ height, padding: Math.max(6, height * 0.14) }}
    >
      <div
        className="font-black tabular-nums text-center text-muted-foreground/40"
        style={{ width: rankSize * 1.4, fontSize: rankSize, lineHeight: 1 }}
      >
        {rank}
      </div>
    </div>
  );
}

/* ---------- pool card ---------- */
function PoolCard({
  node, called, highlighted, badge, w, h,
}: { node: MindNode; called: boolean; highlighted: boolean; badge?: string; w: number; h: number }) {
  const url = useResolvedImage(node);
  const accent = node.color ?? "#f59e0b"; // amber default
  const titleSize = Math.max(9, Math.min(15, h * 0.11));
  return (
    <motion.div
      layout
      animate={{ scale: highlighted ? 1.08 : 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className={`relative rounded-xl border-2 overflow-hidden flex flex-col ${
        highlighted
          ? "z-10"
          : called
            ? "border-border bg-muted/30 opacity-30 grayscale"
            : "border-border bg-card/60"
      }`}
      style={{
        width: w,
        height: h,
        ...(highlighted
          ? {
              borderColor: accent,
              background: `${accent}1a`,
              boxShadow: `0 0 40px ${accent}88`,
            }
          : undefined),
      }}
    >
      <div className="flex-1 min-h-0 bg-muted grid place-items-center overflow-hidden">
        {url ? (
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <span className="text-muted-foreground px-2 text-center line-clamp-3" style={{ fontSize: titleSize }}>
            {node.text}
          </span>
        )}
      </div>
      {url && (
        <div
          className="px-2 py-1 text-foreground text-center line-clamp-2 leading-tight bg-card/80"
          style={{ fontSize: titleSize }}
        >
          {node.text || "—"}
        </div>
      )}
      {highlighted && badge && (
        <div
          className="absolute top-1 left-1 rounded-full font-black px-2 py-0.5 text-xs tabular-nums shadow-lg"
          style={{ background: accent, color: "#0a0a0a" }}
        >
          {badge}
        </div>
      )}
    </motion.div>
  );
}


/* ---------- spotlight ---------- */
function SpotlightCard({ node }: { node: MindNode }) {
  const url = useResolvedImage(node);
  const body = (node.body || "").trim();
  const hasImage = !!url;
  const accent = node.color ?? "#f59e0b";
  return (
    <div
      className="w-[min(560px,78vw)] max-h-[80vh] rounded-2xl overflow-hidden border-2 bg-card flex flex-col"
      style={{ borderColor: `${accent}99`, boxShadow: `0 20px 80px ${accent}55` }}
    >
      {hasImage && (
        <div className="w-full aspect-[16/10] bg-muted grid place-items-center overflow-hidden shrink-0">
          <img src={url!} alt="" className="size-full object-contain" />
        </div>
      )}
      <div className="px-6 py-5 flex flex-col items-center gap-3 text-center overflow-hidden">
        <div className={`font-bold leading-tight text-foreground ${hasImage ? "text-2xl" : "text-3xl"}`}>
          {node.text || "Item"}
        </div>
        {body && (
          <p className="text-sm leading-relaxed text-muted-foreground max-w-[46ch] whitespace-pre-wrap line-clamp-6">
            {body}
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------- main ---------- */
export function RankingPresentation({
  project, recording = false,
}: { project: Project; recording?: boolean }) {
  const root = project.nodes.find((n) => n.role === "ranking" || !n.parentId);
  const callOrder = useMemo(
    () => project.nodes
      .filter((n) => n.role === "item" && n.parentId === root?.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [project.nodes, root?.id],
  );

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

  const N = callOrder.length;

  /* -----------------------------------------------------------
     Step machine — 3 steps per item:
        step = 0           → empty ranking, nothing shown
        step = 3k + 1      → spotlight OPEN for item k
                             (speaker introduces the item)
        step = 3k + 2      → spotlight CLOSED, item k highlighted in pool
                             (speaker compares out loud, item stays in pool)
        step = 3k + 3      → item k placed into ranking list
                             (leapfrog animation into final position)
  ----------------------------------------------------------- */
  const [step, setStep] = useState(0);
  useEffect(() => { setStep(0); }, [project.id]);

  const maxStep = N * 3;
  const goNext = () => setStep((s) => Math.min(s + 1, maxStep));
  const goPrev = () => setStep((s) => Math.max(s - 1, 0));

  // spotlight (phase 1 of each item)
  const spotlightIndex = (() => {
    if (step === 0) return -1;
    const mod = ((step - 1) % 3);
    if (mod !== 0) return -1;
    const k = (step - 1) / 3;
    return k < N ? k : -1;
  })();
  // pool highlight (phase 2 of each item)
  const highlightIndex = (() => {
    if (step === 0) return -1;
    const mod = ((step - 1) % 3);
    if (mod !== 1) return -1;
    const k = (step - 2) / 3;
    return k < N ? k : -1;
  })();
  // how many items have completed phase 3 → belong to the ranking list
  const placedCount = Math.floor(step / 3);

  const spotlightNode = spotlightIndex >= 0 ? callOrder[spotlightIndex] : null;
  const highlightNode = highlightIndex >= 0 ? callOrder[highlightIndex] : null;

  const placedIds = useMemo(
    () => new Set(callOrder.slice(0, placedCount).map((n) => n.id)),
    [callOrder, placedCount],
  );
  const revealed = useMemo(
    () => callOrder
      .filter((n) => placedIds.has(n.id))
      .sort((a, b) => (rankOf.get(a.id) ?? 999) - (rankOf.get(b.id) ?? 999)),
    [callOrder, placedIds, rankOf],
  );


  const navLabel = N > 0 ? `${placedCount} / ${N}` : "0 / 0";

  const pool = useAutoGrid(Math.max(1, N), 1);

  const rankColRef = useRef<HTMLDivElement>(null);
  const [rankColH, setRankColH] = useState(0);
  useLayoutEffect(() => {
    if (!rankColRef.current) return;
    const el = rankColRef.current;
    const ro = new ResizeObserver(([e]) => setRankColH(e.contentRect.height));
    ro.observe(el);
    setRankColH(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  const rowGap = 8;
  const rowHeight = N > 0
    ? Math.max(38, Math.min(88, (rankColH - rowGap * (N - 1)) / N))
    : 60;

  return (
    <PresentationShell
      project={project}
      recording={recording}
      navLabel={navLabel}
      onNext={goNext}
      onPrev={goPrev}
      canNext={step < maxStep}
      canPrev={step > 0}
      frameBg="bg-background"
    >
      {() => (
        <div className="absolute inset-0 flex flex-col p-6 text-foreground">
          <div className="text-2xl md:text-3xl font-bold text-center mb-3 opacity-95 shrink-0">
            {project.title}
          </div>

          {N === 0 ? (
            <div className="flex-1 grid place-items-center text-muted-foreground">
              Adicione itens antes de apresentar.
            </div>
          ) : (
            <div className="flex-1 min-h-0 grid grid-cols-[minmax(280px,42%)_1fr] gap-6">
              {/* -------- Ranking column (left) -------- */}
              <div className="flex flex-col min-h-0">
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2 text-center shrink-0">
                  Ranking
                </div>
                <div ref={rankColRef} className="flex-1 min-h-0">
                  <LayoutGroup>
                    <div className="flex flex-col" style={{ gap: rowGap }}>
                      {Array.from({ length: N }).map((_, i) => {
                        const rank = i + 1;
                        const node = revealed[i];
                        if (!node) {
                          return <EmptySlot key={`empty-${rank}`} rank={rank} height={rowHeight} />;
                        }
                        return (
                          <motion.div
                            key={node.id}
                            layout
                            initial={{ opacity: 0, scale: 0.85, x: 40 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            transition={{ type: "spring", stiffness: 240, damping: 24 }}
                          >
                            <RankRow node={node} rank={rank} height={rowHeight} />
                          </motion.div>
                        );
                      })}
                    </div>
                  </LayoutGroup>
                </div>
              </div>

              {/* -------- Pool column (right) -------- */}
              <div className="flex flex-col min-h-0">
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2 text-center shrink-0">
                  {placedCount < N ? "Competidores" : "Todos chamados"}
                </div>
                <div ref={pool.ref} className="flex-1 min-h-0 relative">
                  <LayoutGroup id="pool">
                    <div
                      className="absolute inset-0 grid content-center justify-center"
                      style={{
                        gridTemplateColumns: `repeat(${pool.cols}, ${pool.cellW - 8}px)`,
                        gridAutoRows: `${pool.cellH - 8}px`,
                        gap: 8,
                      }}
                    >
                      {callOrder.map((n) => {
                        const isNext = highlightNode?.id === n.id;
                        let badge: string | undefined;
                        if (isNext) {
                          const myRank = rankOf.get(n.id) ?? 999;
                          const pos = revealed.filter((r) => (rankOf.get(r.id) ?? 999) < myRank).length + 1;
                          badge = `#${pos}`;
                        }
                        return (
                          <PoolCard
                            key={n.id}
                            node={n}
                            called={placedIds.has(n.id)}
                            highlighted={isNext}
                            badge={badge}
                            w={pool.cellW - 8}
                            h={pool.cellH - 8}
                          />
                        );
                      })}
                    </div>
                  </LayoutGroup>
                </div>
              </div>
            </div>
          )}

          {/* -------- Spotlight overlay -------- */}
          <AnimatePresence>
            {spotlightNode && (
              <>
                <motion.div
                  key="spot-bg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-0 bg-background/70 backdrop-blur-sm pointer-events-none"
                />
                <motion.div
                  key={`spot-${spotlightNode.id}`}
                  initial={{ opacity: 0, scale: 0.85, y: 40 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -20 }}
                  transition={{ type: "spring", stiffness: 200, damping: 22 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none p-6"
                >
                  <SpotlightCard node={spotlightNode} />
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      )}
    </PresentationShell>
  );
}
