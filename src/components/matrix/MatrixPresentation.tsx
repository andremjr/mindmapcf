import { useEffect, useMemo, useRef, useState } from "react";
import type { MindNode, Project } from "@/lib/types";
import { resolveImage } from "@/lib/imageStorage";
import { useStore } from "@/lib/store";
import { PresentationShell } from "@/components/shared/PresentationShell";
import { AvatarLayer } from "@/components/shared/AvatarLayer";
import { parseAxis, RingLegend, type AxisConfig, type ChartType } from "./MatrixEditor";



/* ---------- Card ---------- */
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

function Card({ node, active }: { node: MindNode; active: boolean }) {
  const url = useResolvedImage(node);
  const accent = node.color;
  const activeStyle: React.CSSProperties = active
    ? {
        borderColor: accent ?? "hsl(var(--primary))",
        boxShadow: `0 0 30px ${accent ? `${accent}88` : "hsl(var(--primary) / 0.55)"}`,
      }
    : { borderColor: accent ?? "hsl(var(--border) / 0.6)" };
  return (
    <div
      className={`rounded-lg overflow-hidden border-2 shadow-lg transition-all duration-500 bg-card ${
        active ? "ring-2 ring-offset-1 ring-offset-background" : ""
      }`}
      style={{
        width: 118,
        ...activeStyle,
        ...(active && accent ? ({ ["--tw-ring-color" as any]: accent } as React.CSSProperties) : {}),
      }}
    >
      {url && (
        <div className="aspect-square bg-muted">
          <img src={url} alt="" className="size-full object-cover" />
        </div>
      )}
      <div className="p-1.5 text-[11px] text-foreground leading-tight line-clamp-2 min-h-[1.8rem] text-center">
        {node.text || "Card"}
      </div>
    </div>
  );
}

/* ---------- Spotlight modal (justification focus) ---------- */
function Spotlight({ node, onClose }: { node: MindNode; onClose: () => void }) {
  const url = useResolvedImage(node);
  const accent = node.color ?? "hsl(var(--primary))";
  const body = (node.body || "").trim();
  return (
    <div
      className="absolute inset-0 z-30 grid place-items-center bg-background/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-[min(620px,82vw)] max-h-[82vh] rounded-2xl overflow-hidden border-2 bg-card shadow-2xl flex flex-col animate-scale-in"
        style={{ borderColor: accent, boxShadow: `0 20px 80px ${accent}55` }}
        onClick={(e) => e.stopPropagation()}
      >
        {url && (
          <div className="w-full aspect-[16/10] bg-muted grid place-items-center overflow-hidden shrink-0">
            <img src={url} alt="" className="size-full object-contain" />
          </div>
        )}
        <div className="px-6 py-5 flex flex-col items-center gap-3 text-center overflow-hidden">
          <div className={`font-bold leading-tight text-foreground ${url ? "text-2xl" : "text-3xl"}`}>
            {node.text || "Card"}
          </div>
          {body && (
            <p className="text-sm leading-relaxed text-muted-foreground max-w-[52ch] whitespace-pre-wrap line-clamp-8">
              {body}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Narrative step machine ---------- */
type Step =
  | { kind: "intro"; caption: string }
  | { kind: "axis"; axis: "x" | "y" | "grid" | "zones" | "rings"; caption: string }
  | { kind: "reveal"; index: number }
  | { kind: "focus"; index: number };

function buildSteps(chart: ChartType, axis: AxisConfig, cards: MindNode[]): Step[] {
  const steps: Step[] = [];
  const introMap: Record<ChartType, string> = {
    quadrants: "Vamos posicionar cada item em um dos quatro cenários.",
    scatter:   "Cada ponto revela uma relação entre dois fatores.",
    line:      "Vamos percorrer esta linha do início ao fim.",
    bullseye:  "Do menos prioritário ao alvo central.",
  };
  steps.push({ kind: "intro", caption: introMap[chart] });

  if (chart === "quadrants") {
    steps.push({ kind: "axis", axis: "y", caption: `Eixo vertical: ${axis.yLow} → ${axis.yHigh}` });
    steps.push({ kind: "axis", axis: "x", caption: `Eixo horizontal: ${axis.xLow} → ${axis.xHigh}` });
    steps.push({ kind: "axis", axis: "zones", caption: "Quatro zonas formadas pelos eixos." });
  } else if (chart === "scatter") {
    steps.push({ kind: "axis", axis: "y", caption: `Eixo Y: ${axis.yLabel}` });
    steps.push({ kind: "axis", axis: "x", caption: `Eixo X: ${axis.xLabel}` });
    steps.push({ kind: "axis", axis: "grid", caption: "A escala está pronta para receber os dados." });
  } else if (chart === "line") {
    steps.push({ kind: "axis", axis: "x", caption: axis.lineLabel });
  } else if (chart === "bullseye") {
    steps.push({ kind: "axis", axis: "rings", caption: axis.bullseyeLabel });
  }

  // For each card: land it on the chart (reveal) and immediately open the
  // spotlight so the narrator can justify why it sits there (focus).
  // A second click closes the spotlight and leaves the card highlighted in place.
  const order = revealOrder(chart, cards);
  order.forEach((i) => {
    steps.push({ kind: "reveal", index: i });
    steps.push({ kind: "focus",  index: i });
  });
  return steps;
}

function revealOrder(chart: ChartType, cards: MindNode[]): number[] {
  const idxs = cards.map((_, i) => i);
  if (chart === "bullseye") {
    // outer → inner (distance from center descending)
    const dist = (c: MindNode) => {
      const dx = (c.pctX ?? 50) - 50, dy = (c.pctY ?? 50) - 50;
      return dx * dx + dy * dy;
    };
    return idxs.sort((a, b) => dist(cards[b]) - dist(cards[a]));
  }
  if (chart === "scatter") {
    // left → right, bottom → top (a data story)
    return idxs.sort((a, b) => {
      const dx = (cards[a].pctX ?? 50) - (cards[b].pctX ?? 50);
      if (Math.abs(dx) > 3) return dx;
      return (cards[b].pctY ?? 50) - (cards[a].pctY ?? 50);
    });
  }
  // quadrants and line: keep author order
  return idxs;
}


/* ---------- Main ---------- */
export function MatrixPresentation({
  project, recording = false,
}: { project: Project; recording?: boolean }) {
  const root = project.nodes.find((n) => n.role === "matrix" || !n.parentId);
  const axis = useMemo(() => parseAxis(root?.body), [root?.body]);
  const chart: ChartType = axis.chartType;
  const cards = useMemo(
    () => project.nodes.filter((n) => n.role === "item" && n.parentId === root?.id),
    [project.nodes, root?.id],
  );

  /** Manual mode locked at mount: if no card is placed, the author positions
   *  cards live during the presentation. */
  const isPlaced = (n: MindNode) =>
    typeof n.pctX === "number" && (chart === "line" || typeof n.pctY === "number");
  const manualMode = useState<boolean>(
    () => cards.length > 0 && cards.every((c) => !isPlaced(c)),
  )[0];
  const updateNode = useStore((s) => s.updateNode);
  const planeWrapRef = useRef<HTMLDivElement>(null);
  const [dragPoolId, setDragPoolId] = useState<string | null>(null);
  const placedCards = useMemo(() => cards.filter(isPlaced), [cards, chart]);
  const unplacedCards = useMemo(() => cards.filter((c) => !isPlaced(c)), [cards, chart]);
  function onManualDrop(e: React.DragEvent) {
    if (!dragPoolId || !planeWrapRef.current) return;
    e.preventDefault();
    const r = planeWrapRef.current.getBoundingClientRect();
    const pctX = Math.max(3, Math.min(97, ((e.clientX - r.left) / r.width) * 100));
    const pctY = chart === "line"
      ? 50
      : Math.max(3, Math.min(97, ((e.clientY - r.top) / r.height) * 100));
    updateNode(project.id, dragPoolId, { pctX, pctY } as Partial<MindNode>);
    setDragPoolId(null);
  }

  const steps = useMemo(() => buildSteps(chart, axis, cards), [chart, axis, cards]);
  const [step, setStep] = useState(0);
  const current = steps[step];

  // What's revealed so far
  const revealedSet = useMemo(() => {
    const s = new Set<number>();
    for (let i = 0; i <= step; i++) {
      const st = steps[i];
      if (st?.kind === "reveal" || st?.kind === "focus") s.add(st.index);
    }
    return s;
  }, [steps, step]);

  const axisPhase = useMemo(() => {
    const phase = { y: false, x: false, grid: false, zones: false, rings: false };
    for (let i = 0; i <= step; i++) {
      const st = steps[i];
      if (st?.kind === "axis") phase[st.axis] = true;
      if (st?.kind === "reveal" || st?.kind === "focus") {
        // once cards start revealing, all axis elements are visible
        phase.y = phase.x = phase.grid = phase.zones = phase.rings = true;
      }
    }
    return phase;
  }, [steps, step]);

  const activeIdx =
    current?.kind === "reveal" || current?.kind === "focus" ? current.index : -1;

  const spotlightCard =
    current?.kind === "focus" && activeIdx >= 0 ? cards[activeIdx] : null;

  const activeCard = activeIdx >= 0 ? cards[activeIdx] : null;
  const caption =
    current?.kind === "intro" || current?.kind === "axis"
      ? current.caption
      : current?.kind === "reveal"
        ? activeCard?.body || activeCard?.text || ""
        : "";

  const navLabel = manualMode
    ? `${placedCards.length} / ${cards.length}`
    : `${step + 1} / ${steps.length}`;

  if (manualMode) {
    return (
      <PresentationShell
        project={project}
        recording={recording}
        navLabel={navLabel}
        onNext={() => {}}
        onPrev={() => {}}
        canNext={false}
        canPrev={false}
        frameBg="bg-background"
      >
        {({ size }) => (
          <div className="absolute inset-0 flex flex-col p-6 text-foreground">
            <AvatarLayer project={project} frameSize={size} />
            <div className="text-2xl font-bold text-center mb-1 opacity-90">{project.title}</div>
            <div className="text-center text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
              Modo manual — arraste os cards para o gráfico
            </div>
            <div
              ref={planeWrapRef}
              className="flex-1 min-h-0 flex flex-col relative"
              onDragOver={(e) => { if (dragPoolId) e.preventDefault(); }}
              onDrop={onManualDrop}
            >
              <ChartView
                chart={chart}
                axis={axis}
                cards={placedCards}
                activeIdx={-1}
                revealed={new Set(placedCards.map((_, i) => i))}
                axisPhase={{ y: true, x: true, grid: true, zones: true, rings: true }}
              />
            </div>
            {/* Pool */}
            <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 shrink-0">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[11px] uppercase tracking-widest opacity-60">
                  {unplacedCards.length > 0 ? "Arraste para o gráfico" : "Todos posicionados"}
                </div>
                <div className="text-[11px] opacity-60 font-mono tabular-nums">
                  {unplacedCards.length} restante{unplacedCards.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className="flex gap-2 items-center overflow-x-auto min-h-[72px]">
                {unplacedCards.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => setDragPoolId(c.id)}
                    onDragEnd={() => setDragPoolId(null)}
                    className="cursor-grab active:cursor-grabbing shrink-0 rounded-md border-2 bg-card overflow-hidden"
                    style={{ width: 96, borderColor: c.color ?? "hsl(var(--border))" }}
                  >
                    <PoolThumb node={c} />
                    <div className="p-1 text-[10px] leading-tight text-center line-clamp-2 min-h-[1.6rem]">
                      {c.text || "Card"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </PresentationShell>
    );
  }



  return (
    <PresentationShell
      project={project}
      recording={recording}
      navLabel={navLabel}
      onNext={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
      onPrev={() => setStep((s) => Math.max(0, s - 1))}
      canNext={step < steps.length - 1}
      canPrev={step > 0}
      frameBg="bg-background"
    >
      {({ size }) => (
        <div className="absolute inset-0 flex flex-col p-6 text-foreground">
          <AvatarLayer project={project} frameSize={size} />
          <div className="text-2xl font-bold text-center mb-2 opacity-90">{project.title}</div>
          {cards.length === 0 ? (
            <div className="flex-1 grid place-items-center text-muted-foreground">Adicione cards antes de apresentar.</div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col">
              <ChartView
                chart={chart}
                axis={axis}
                cards={cards}
                activeIdx={activeIdx}
                revealed={revealedSet}
                axisPhase={axisPhase}
              />
              {caption && (
                <div className="mt-3 mx-auto max-w-2xl text-sm bg-card/80 border border-border/60 rounded-md px-4 py-2 text-center animate-fade-in">
                  {caption}
                </div>
              )}
            </div>
          )}

          {spotlightCard && (
            <Spotlight
              node={spotlightCard}
              onClose={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
            />
          )}
        </div>
      )}
    </PresentationShell>
  );
}

/* ---------- Chart renderer ---------- */
function ChartView({
  chart, axis, cards, activeIdx, revealed, axisPhase,
}: {
  chart: ChartType;
  axis: AxisConfig;
  cards: MindNode[];
  activeIdx: number;
  revealed: Set<number>;
  axisPhase: { y: boolean; x: boolean; grid: boolean; zones: boolean; rings: boolean };
}) {
  // For the line/timeline chart the user wants every card visible from the
  // start of the video — steps only highlight/spotlight in author order.
  const alwaysShown = chart === "line";
  const renderCard = (c: MindNode, i: number, style: React.CSSProperties) => {
    const shown = alwaysShown || revealed.has(i);
    const active = i === activeIdx;
    return (
      <div
        key={c.id}
        className="absolute transition-all duration-700 ease-out"
        style={{
          ...style,
          zIndex: active ? 5 : 1,
          opacity: shown ? (active ? 1 : 0.75) : 0,
          transform: `${style.transform ?? ""} ${shown ? (active ? "scale(1.12)" : "scale(1)") : "scale(0.4)"}`,
          pointerEvents: shown ? "auto" : "none",
        }}
      >
        <Card node={c} active={active} />
      </div>
    );
  };

  if (chart === "line") {
    return (
      <div className="flex-1 flex flex-col">
        <div className={`text-center text-xs font-semibold text-muted-foreground mb-1 transition-opacity duration-500 ${axisPhase.x ? "opacity-100" : "opacity-0"}`}>
          {axis.lineLabel}
        </div>
        <div className="relative flex-1 rounded-xl border-2 border-border/40 bg-muted/20 overflow-hidden">
          <div className="absolute inset-y-0 left-0 right-0 flex items-center px-4 pointer-events-none">
            <div
              className="h-0.5 bg-border origin-left transition-all duration-1000 ease-out"
              style={{ width: axisPhase.x ? "100%" : "0%" }}
            />
          </div>
          <div className={`absolute top-2 left-3 text-[11px] text-muted-foreground transition-opacity duration-500 ${axisPhase.x ? "opacity-100" : "opacity-0"}`}>← {axis.xLow}</div>
          <div className={`absolute top-2 right-3 text-[11px] text-muted-foreground transition-opacity duration-500 delay-300 ${axisPhase.x ? "opacity-100" : "opacity-0"}`}>{axis.xHigh} →</div>
          {/* milestones */}
          {axis.linePoints.map((p, i) => (
            <div
              key={p.id}
              className="absolute pointer-events-none transition-opacity duration-500"
              style={{
                left: `${p.pctX}%`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                opacity: axisPhase.x ? 1 : 0,
                transitionDelay: `${400 + i * 80}ms`,
              }}
            >
              <div className="mx-auto size-2.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />
              <div
                className={`absolute left-1/2 -translate-x-1/2 text-[11px] font-medium text-muted-foreground whitespace-nowrap ${p.side === "top" ? "bottom-5" : "top-5"}`}
              >{p.label}</div>
            </div>
          ))}
          {cards.map((c, i) =>
            renderCard(c, i, {
              left: `${c.pctX ?? 50}%`,
              top: "50%",
              transform: "translate(-50%, -50%)",
            }))}
        </div>
      </div>
    );
  }

  if (chart === "bullseye") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className={`text-center text-xs font-semibold text-muted-foreground mb-2 transition-opacity duration-500 ${axisPhase.rings ? "opacity-100" : "opacity-0"}`}>
          {axis.bullseyeLabel}
        </div>
        <div className="relative rounded-full border-2 border-border/40 bg-muted/10 overflow-hidden"
          style={{ width: "min(62vh, 82%)", aspectRatio: "1 / 1" }}>
          {[0.85, 0.6, 0.35, 0.15].map((r, i) => {
            const ring = axis.rings[i];
            return (
              <div key={i}
                className="absolute rounded-full border transition-all duration-700 ease-out"
                style={{
                  left: "50%", top: "50%",
                  width: axisPhase.rings ? `${r * 100}%` : "0%",
                  height: axisPhase.rings ? `${r * 100}%` : "0%",
                  transform: "translate(-50%, -50%)",
                  background: `${ring?.color ?? "#94A3B8"}22`,
                  borderColor: `${ring?.color ?? "#94A3B8"}88`,
                  transitionDelay: `${i * 150}ms`,
                  opacity: axisPhase.rings ? 1 : 0,
                }} />
            );
          })}
          {cards.map((c, i) =>
            renderCard(c, i, {
              left: `${c.pctX ?? 50}%`,
              top: `${c.pctY ?? 50}%`,
              transform: "translate(-50%, -50%)",
            }))}
        </div>
        <RingLegend rings={axis.rings} className={`mt-3 transition-opacity duration-500 ${axisPhase.rings ? "opacity-100" : "opacity-0"}`} />
      </div>
    );
  }



  const isScatter = chart === "scatter";
  const yTop    = isScatter ? axis.yLabel : `↑ ${axis.yHigh}`;
  const yBottom = isScatter ? ""          : `↓ ${axis.yLow}`;
  const xLeft   = isScatter ? ""          : axis.xLow;
  const xRight  = isScatter ? axis.xLabel : axis.xHigh;

  return (
    <div className="flex-1 flex flex-col">
      <div className={`text-center text-xs font-semibold text-muted-foreground mb-1 transition-opacity duration-500 ${axisPhase.y ? "opacity-100" : "opacity-0"}`}>{yTop}</div>
      <div className="flex-1 flex items-stretch gap-2">
        <div className={`grid place-items-center text-xs font-semibold text-muted-foreground px-1 transition-opacity duration-500 ${axisPhase.x ? "opacity-100" : "opacity-0"}`}
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
          {xLeft}
        </div>
        <div className="relative flex-1 rounded-xl border-2 border-border/40 bg-muted/10 overflow-hidden">
          {isScatter ? (
            <div className="absolute inset-0 pointer-events-none">
              {[20, 40, 60, 80].map((p) => (
                <div key={`v${p}`}
                  className="absolute inset-y-0 w-px bg-border/30 transition-opacity duration-700"
                  style={{ left: `${p}%`, opacity: axisPhase.grid ? 1 : 0 }} />
              ))}
              {[20, 40, 60, 80].map((p) => (
                <div key={`h${p}`}
                  className="absolute inset-x-0 h-px bg-border/30 transition-opacity duration-700"
                  style={{ top: `${p}%`, opacity: axisPhase.grid ? 1 : 0 }} />
              ))}
              <div className={`absolute inset-y-0 left-0 w-px bg-border/70 origin-bottom transition-transform duration-700 ${axisPhase.y ? "scale-y-100" : "scale-y-0"}`} />
              <div className={`absolute inset-x-0 bottom-0 h-px bg-border/70 origin-left transition-transform duration-700 ${axisPhase.x ? "scale-x-100" : "scale-x-0"}`} />
            </div>
          ) : (
            <div className="absolute inset-0 pointer-events-none">
              <div className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border/50 origin-top transition-transform duration-700 ${axisPhase.y ? "scale-y-100" : "scale-y-0"}`} />
              <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border/50 origin-left transition-transform duration-700 ${axisPhase.x ? "scale-x-100" : "scale-x-0"}`} />
              {/* zone tints */}
              {axisPhase.zones && (
                <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 animate-fade-in">
                  <div className="bg-emerald-500/5" />
                  <div className="bg-amber-500/5" />
                  <div className="bg-rose-500/5" />
                  <div className="bg-sky-500/5" />
                </div>
              )}
            </div>
          )}
          {cards.map((c, i) =>
            renderCard(c, i, {
              left: `${c.pctX ?? 50}%`,
              top: `${c.pctY ?? 50}%`,
              transform: "translate(-50%, -50%)",
            }))}
        </div>
        <div className={`grid place-items-center text-xs font-semibold text-muted-foreground px-1 transition-opacity duration-500 ${axisPhase.x ? "opacity-100" : "opacity-0"}`}
          style={{ writingMode: "vertical-rl" }}>
          {xRight}
        </div>
      </div>
      <div className={`text-center text-xs font-semibold text-muted-foreground mt-1 transition-opacity duration-500 ${axisPhase.y ? "opacity-100" : "opacity-0"}`}>{yBottom}</div>
    </div>
  );
}
