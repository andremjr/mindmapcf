import { useEffect, useMemo, useRef, useState } from "react";
import type { MindNode, Project } from "@/lib/types";
import { resolveImage } from "@/lib/imageStorage";
import { useStore } from "@/lib/store";
import { PresentationShell } from "@/components/shared/PresentationShell";
import { AvatarLayer } from "@/components/shared/AvatarLayer";
import { aspectDims, type ItemAspect } from "@/lib/tierlistConfig";
import { parseAxis, RingLegend, type AxisConfig, type ChartType } from "./MatrixEditor";

/* ---------- Image resolver ---------- */
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

/* ---------- Card (aspect-aware, accent glow when active) ---------- */
function Card({
  node, active, aspect, accent,
}: { node: MindNode; active: boolean; aspect: ItemAspect; accent: string }) {
  const url = useResolvedImage(node);
  const { w } = aspectDims(96, aspect);
  const img = aspectDims(96, aspect);
  const cardAccent = node.color ?? accent;
  const style: React.CSSProperties = {
    width: w,
    borderColor: active ? cardAccent : (node.color ?? "hsl(var(--border) / 0.6)"),
    boxShadow: active ? `0 0 28px ${cardAccent}99, 0 0 60px ${cardAccent}55` : undefined,
  };
  return (
    <div
      className="rounded-lg overflow-hidden border-2 shadow-lg transition-all duration-500 bg-card"
      style={style}
    >
      {url && (
        <div className="bg-muted overflow-hidden" style={{ width: img.w, height: img.h }}>
          <img src={url} alt="" className="size-full object-cover" />
        </div>
      )}
      <div className="p-1.5 text-[11px] text-foreground leading-tight line-clamp-2 min-h-[1.8rem] text-center">
        {node.text || "Card"}
      </div>
    </div>
  );
}

/* ---------- Pool thumb (manual mode) ---------- */
function PoolThumb({ node, aspect }: { node: MindNode; aspect: ItemAspect }) {
  const url = useResolvedImage(node);
  const { w, h } = aspectDims(64, aspect);
  return (
    <div className="bg-muted overflow-hidden" style={{ width: w, height: h }}>
      {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
    </div>
  );
}

/* ---------- Side spotlight (does NOT cover the chart) ----------
 * Occupies right ~34% of the frame; the chart shrinks to the remaining space
 * so the audience keeps the context of where the card sits on the graph. */
function SideSpotlight({
  node, accent, zoneLabel, onClose,
}: { node: MindNode; accent: string; zoneLabel: string; onClose: () => void }) {
  const url = useResolvedImage(node);
  const body = (node.body || "").trim();
  const cardAccent = node.color ?? accent;
  return (
    <aside
      className="absolute top-0 right-0 h-full w-[34%] min-w-[280px] max-w-[420px] z-30 p-4 animate-slide-in-right"
      onClick={onClose}
    >
      <div
        className="h-full rounded-2xl border-2 bg-card/95 backdrop-blur-md shadow-2xl flex flex-col overflow-hidden"
        style={{ borderColor: cardAccent, boxShadow: `0 20px 80px ${cardAccent}55` }}
        onClick={(e) => e.stopPropagation()}
      >
        {url && (
          <div className="w-full aspect-[4/3] bg-muted overflow-hidden shrink-0">
            <img src={url} alt="" className="size-full object-cover" />
          </div>
        )}
        <div className="px-5 py-4 flex flex-col gap-2 overflow-auto">
          {zoneLabel && (
            <div
              className="inline-flex self-start text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${cardAccent}22`, color: cardAccent, border: `1px solid ${cardAccent}55` }}
            >{zoneLabel}</div>
          )}
          <div className="text-xl font-bold leading-tight">{node.text || "Card"}</div>
          {body && (
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {body}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ---------- Steps ---------- */
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
    const dist = (c: MindNode) => {
      const dx = (c.pctX ?? 50) - 50, dy = (c.pctY ?? 50) - 50;
      return dx * dx + dy * dy;
    };
    return idxs.sort((a, b) => dist(cards[b]) - dist(cards[a]));
  }
  if (chart === "scatter") {
    return idxs.sort((a, b) => {
      const dx = (cards[a].pctX ?? 50) - (cards[b].pctX ?? 50);
      if (Math.abs(dx) > 3) return dx;
      return (cards[b].pctY ?? 50) - (cards[a].pctY ?? 50);
    });
  }
  return idxs;
}

/* ---------- Human-readable "where this card sits" ---------- */
function zoneLabelFor(chart: ChartType, axis: AxisConfig, card: MindNode | null): string {
  if (!card) return "";
  const x = card.pctX ?? 50;
  const y = card.pctY ?? 50;
  if (chart === "quadrants") {
    const yPart = y < 50 ? axis.yHigh : axis.yLow;
    const xPart = x < 50 ? axis.xLow : axis.xHigh;
    return `${yPart} · ${xPart}`;
  }
  if (chart === "bullseye") {
    const d = Math.hypot(x - 50, y - 50) / 50; // 0..1 (approx)
    // matches ring radii [0.85, 0.6, 0.35, 0.15] (outer→inner)
    const ringIdx = d > 0.6 ? 0 : d > 0.35 ? 1 : d > 0.15 ? 2 : 3;
    return axis.rings[ringIdx]?.label || `Anel ${ringIdx + 1}`;
  }
  if (chart === "line") {
    return `${Math.round(x)}% — ${axis.xLow} → ${axis.xHigh}`;
  }
  // scatter
  return `X ${Math.round(x)} · Y ${Math.round(100 - y)}`;
}

/* ---------- Camera ----------
 * Virtual camera: pans + zooms the chart so the active card is roughly
 * centered at ~55% of the visible frame. Chart is transformed as a whole
 * using CSS transform for buttery 1.6s ease-in-out motion. */
function useCamera(active: { pctX: number; pctY: number } | null, focused: boolean) {
  // Zoom factor: focused (spotlight open) = tighter; reveal only = medium; idle = 1.
  const zoom = focused ? 1.7 : active ? 1.35 : 1;
  const cx = active?.pctX ?? 50;
  const cy = active?.pctY ?? 50;
  // We want the point (cx, cy) to land at the frame center (50, 50) after scaling.
  // translate before scale: t = (50 - cx) * zoom, same for y.
  const tx = (50 - cx) * zoom;
  const ty = (50 - cy) * zoom;
  return {
    transform: `translate(${tx}%, ${ty}%) scale(${zoom})`,
    transformOrigin: "50% 50%",
    transition: "transform 1600ms cubic-bezier(0.22, 1, 0.36, 1)",
  } as React.CSSProperties;
}

/* ---------- Main ---------- */
export function MatrixPresentation({
  project, recording = false,
}: { project: Project; recording?: boolean }) {
  const root = project.nodes.find((n) => n.role === "matrix" || !n.parentId);
  const axis = useMemo(() => parseAxis(root?.body), [root?.body]);
  const chart: ChartType = axis.chartType;
  const accent = axis.accentColor;
  const aspect = axis.itemAspect;
  const cards = useMemo(
    () => project.nodes.filter((n) => n.role === "item" && n.parentId === root?.id),
    [project.nodes, root?.id],
  );

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

  // Manual mode: after dropping a card, briefly focus it (zoom camera + spotlight)
  const [manualFocusId, setManualFocusId] = useState<string | null>(null);
  const manualFocusTimer = useRef<number | null>(null);
  function focusManual(id: string, duration = 2200) {
    if (manualFocusTimer.current) window.clearTimeout(manualFocusTimer.current);
    setManualFocusId(id);
    manualFocusTimer.current = window.setTimeout(() => setManualFocusId(null), duration);
  }
  useEffect(() => () => { if (manualFocusTimer.current) window.clearTimeout(manualFocusTimer.current); }, []);

  function onManualDrop(e: React.DragEvent) {
    if (!dragPoolId || !planeWrapRef.current) return;
    e.preventDefault();
    const r = planeWrapRef.current.getBoundingClientRect();
    const pctX = Math.max(3, Math.min(97, ((e.clientX - r.left) / r.width) * 100));
    const pctY = chart === "line"
      ? 50
      : Math.max(3, Math.min(97, ((e.clientY - r.top) / r.height) * 100));
    updateNode(project.id, dragPoolId, { pctX, pctY } as Partial<MindNode>);
    const droppedId = dragPoolId;
    setDragPoolId(null);
    focusManual(droppedId, 2000);
  }

  const steps = useMemo(() => buildSteps(chart, axis, cards), [chart, axis, cards]);
  const [step, setStep] = useState(0);
  const current = steps[step];

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
      : "";
  const cameraTarget = activeCard
    ? { pctX: activeCard.pctX ?? 50, pctY: chart === "line" ? 50 : (activeCard.pctY ?? 50) }
    : null;
  const cameraStyle = useCamera(cameraTarget, !!spotlightCard);

  const navLabel = manualMode
    ? `${placedCards.length} / ${cards.length}`
    : `${step + 1} / ${steps.length}`;

  // Manual: also compute a camera targeting the currently-focused (just dropped or clicked) card.
  const manualFocused = manualFocusId ? cards.find((c) => c.id === manualFocusId) ?? null : null;
  const manualCameraTarget = manualFocused
    ? { pctX: manualFocused.pctX ?? 50, pctY: chart === "line" ? 50 : (manualFocused.pctY ?? 50) }
    : null;
  const manualCameraStyle = useCamera(manualCameraTarget, !!manualFocused);
  const manualSpotlight = manualFocused;

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
            <div className="flex-1 min-h-0 flex">
              {/* Chart area shrinks when a spotlight is open on the right */}
              <div
                ref={planeWrapRef}
                className={`min-h-0 relative flex flex-col transition-[width] duration-500 ${manualSpotlight ? "w-[66%]" : "w-full"}`}
                onDragOver={(e) => { if (dragPoolId) e.preventDefault(); }}
                onDrop={onManualDrop}
              >
                <div className="flex-1 min-h-0 relative" style={manualCameraStyle}>
                  <ChartView
                    chart={chart}
                    axis={axis}
                    cards={placedCards}
                    activeIdx={manualFocused ? placedCards.findIndex((c) => c.id === manualFocused.id) : -1}
                    revealed={new Set(placedCards.map((_, i) => i))}
                    axisPhase={{ y: true, x: true, grid: true, zones: true, rings: true }}
                    aspect={aspect}
                    accent={accent}
                    onCardClick={(id) => focusManual(id, 4000)}
                  />
                </div>
              </div>
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
                    style={{ borderColor: c.color ?? "hsl(var(--border))" }}
                  >
                    <PoolThumb node={c} aspect={aspect} />
                    <div className="p-1 text-[10px] leading-tight text-center line-clamp-2 min-h-[1.6rem] w-[64px]">
                      {c.text || "Card"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {manualSpotlight && (
              <SideSpotlight
                node={manualSpotlight}
                accent={accent}
                zoneLabel={zoneLabelFor(chart, axis, manualSpotlight)}
                onClose={() => setManualFocusId(null)}
              />
            )}
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
            <div className="flex-1 min-h-0 flex">
              <div className={`min-h-0 relative flex flex-col transition-[width] duration-500 ${spotlightCard ? "w-[66%]" : "w-full"}`}>
                <div className="flex-1 min-h-0 relative" style={cameraStyle}>
                  <ChartView
                    chart={chart}
                    axis={axis}
                    cards={cards}
                    activeIdx={activeIdx}
                    revealed={revealedSet}
                    axisPhase={axisPhase}
                    aspect={aspect}
                    accent={accent}
                  />
                </div>
                {caption && (
                  <div className="mt-3 mx-auto max-w-2xl text-sm bg-card/80 border border-border/60 rounded-md px-4 py-2 text-center animate-fade-in">
                    {caption}
                  </div>
                )}
              </div>
            </div>
          )}

          {spotlightCard && (
            <SideSpotlight
              node={spotlightCard}
              accent={accent}
              zoneLabel={zoneLabelFor(chart, axis, spotlightCard)}
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
  chart, axis, cards, activeIdx, revealed, axisPhase, aspect, accent, onCardClick,
}: {
  chart: ChartType;
  axis: AxisConfig;
  cards: MindNode[];
  activeIdx: number;
  revealed: Set<number>;
  axisPhase: { y: boolean; x: boolean; grid: boolean; zones: boolean; rings: boolean };
  aspect: ItemAspect;
  accent: string;
  onCardClick?: (id: string) => void;
}) {
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
          opacity: shown ? (active ? 1 : 0.72) : 0,
          transform: `${style.transform ?? ""} ${shown ? (active ? "scale(1.08)" : "scale(1)") : "scale(0.4)"}`,
          pointerEvents: shown ? "auto" : "none",
          cursor: onCardClick ? "pointer" : undefined,
        }}
        onClick={onCardClick ? () => onCardClick(c.id) : undefined}
      >
        <Card node={c} active={active} aspect={aspect} accent={accent} />
      </div>
    );
  };

  const backplate = "px-2 py-0.5 rounded bg-background/70 backdrop-blur-sm";

  if (chart === "line") {
    return (
      <div className="absolute inset-0 flex flex-col">
        <div className={`text-center text-sm font-semibold text-muted-foreground mb-1 transition-opacity duration-500 ${axisPhase.x ? "opacity-100" : "opacity-0"}`}>
          <span className={backplate}>{axis.lineLabel}</span>
        </div>
        <div className="relative flex-1 rounded-xl border-2 border-border/40 bg-gradient-to-b from-muted/20 to-background overflow-hidden">
          <div className="absolute inset-y-0 left-0 right-0 flex items-center px-4 pointer-events-none">
            <div
              className="h-0.5 origin-left transition-all duration-1000 ease-out"
              style={{ width: axisPhase.x ? "100%" : "0%", background: accent }}
            />
          </div>
          <div className={`absolute top-2 left-3 text-[11px] transition-opacity duration-500 ${axisPhase.x ? "opacity-100" : "opacity-0"}`}><span className={backplate}>← {axis.xLow}</span></div>
          <div className={`absolute top-2 right-3 text-[11px] transition-opacity duration-500 delay-300 ${axisPhase.x ? "opacity-100" : "opacity-0"}`}><span className={backplate}>{axis.xHigh} →</span></div>
          {axis.linePoints.map((p, i) => (
            <div
              key={p.id}
              className="absolute pointer-events-none transition-opacity duration-500"
              style={{
                left: `${p.pctX}%`, top: "50%",
                transform: "translate(-50%, -50%)",
                opacity: axisPhase.x ? 1 : 0,
                transitionDelay: `${400 + i * 80}ms`,
              }}
            >
              <div className="mx-auto size-2.5 rounded-full" style={{ background: accent, boxShadow: `0 0 10px ${accent}aa` }} />
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
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`text-center text-sm font-semibold text-muted-foreground mb-2 transition-opacity duration-500 ${axisPhase.rings ? "opacity-100" : "opacity-0"}`}>
          <span className={backplate}>{axis.bullseyeLabel}</span>
        </div>
        <div
          className="relative rounded-full border-2 overflow-hidden"
          style={{
            width: "min(62vh, 82%)", aspectRatio: "1 / 1",
            borderColor: `${accent}66`,
            background: `radial-gradient(circle at center, ${accent}18 0%, transparent 70%)`,
          }}
        >
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
    <div className="absolute inset-0 flex flex-col">
      <div className={`text-center text-sm font-semibold text-muted-foreground mb-1 transition-opacity duration-500 ${axisPhase.y ? "opacity-100" : "opacity-0"}`}>
        <span className={backplate}>{yTop}</span>
      </div>
      <div className="flex-1 flex items-stretch gap-2 min-h-0">
        <div className={`grid place-items-center text-sm font-semibold text-muted-foreground px-1 transition-opacity duration-500 ${axisPhase.x ? "opacity-100" : "opacity-0"}`}
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
          <span className={backplate}>{xLeft}</span>
        </div>
        <div
          className="relative flex-1 rounded-xl border-2 overflow-hidden"
          style={{
            borderColor: `${accent}44`,
            background: `radial-gradient(ellipse at center, ${accent}10 0%, transparent 60%), hsl(var(--muted) / 0.1)`,
          }}
        >
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
              <div className={`absolute inset-y-0 left-0 w-px origin-bottom transition-transform duration-700 ${axisPhase.y ? "scale-y-100" : "scale-y-0"}`} style={{ background: accent }} />
              <div className={`absolute inset-x-0 bottom-0 h-px origin-left transition-transform duration-700 ${axisPhase.x ? "scale-x-100" : "scale-x-0"}`} style={{ background: accent }} />
            </div>
          ) : (
            <div className="absolute inset-0 pointer-events-none">
              <div className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-px origin-top transition-transform duration-700 ${axisPhase.y ? "scale-y-100" : "scale-y-0"}`} style={{ background: `${accent}bb` }} />
              <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-px origin-left transition-transform duration-700 ${axisPhase.x ? "scale-x-100" : "scale-x-0"}`} style={{ background: `${accent}bb` }} />
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
        <div className={`grid place-items-center text-sm font-semibold text-muted-foreground px-1 transition-opacity duration-500 ${axisPhase.x ? "opacity-100" : "opacity-0"}`}
          style={{ writingMode: "vertical-rl" }}>
          <span className={backplate}>{xRight}</span>
        </div>
      </div>
      <div className={`text-center text-sm font-semibold text-muted-foreground mt-1 transition-opacity duration-500 ${axisPhase.y ? "opacity-100" : "opacity-0"}`}>
        <span className={backplate}>{yBottom}</span>
      </div>
    </div>
  );
}
