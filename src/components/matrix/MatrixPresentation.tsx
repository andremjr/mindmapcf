import { useEffect, useMemo, useState } from "react";
import type { MindNode, Project } from "@/lib/types";
import { resolveImage } from "@/lib/imageStorage";
import { PresentationShell } from "@/components/shared/PresentationShell";
import { parseAxis, type AxisConfig, type ChartType } from "./MatrixEditor";

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
  if (chart === "line") {
    return idxs.sort((a, b) => (cards[a].pctX ?? 50) - (cards[b].pctX ?? 50));
  }
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
  // quadrants: keep author order
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

  const steps = useMemo(() => buildSteps(chart, axis, cards), [chart, axis, cards]);
  const [step, setStep] = useState(0);
  const current = steps[step];

  // What's revealed so far
  const revealedSet = useMemo(() => {
    const s = new Set<number>();
    for (let i = 0; i <= step; i++) {
      const st = steps[i];
      if (st?.kind === "reveal") s.add(st.index);
    }
    return s;
  }, [steps, step]);

  const axisPhase = useMemo(() => {
    const phase = { y: false, x: false, grid: false, zones: false, rings: false };
    for (let i = 0; i <= step; i++) {
      const st = steps[i];
      if (st?.kind === "axis") phase[st.axis] = true;
      if (st?.kind === "reveal") {
        // once cards start revealing, all axis elements are visible
        phase.y = phase.x = phase.grid = phase.zones = phase.rings = true;
      }
    }
    return phase;
  }, [steps, step]);

  const activeIdx =
    current?.kind === "reveal" ? current.index : -1;

  const activeCard = activeIdx >= 0 ? cards[activeIdx] : null;
  const caption =
    (current?.kind === "reveal"
      ? activeCard?.body
      : current?.caption) || "";

  const navLabel = `${step + 1} / ${steps.length}`;

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
      {() => (
        <div className="absolute inset-0 flex flex-col p-6 text-foreground">
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
  const renderCard = (c: MindNode, i: number, style: React.CSSProperties) => {
    const shown = revealed.has(i);
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
          style={{ width: "min(70vh, 90%)", aspectRatio: "1 / 1" }}>
          {[0.85, 0.6, 0.35, 0.15].map((r, i) => (
            <div key={i}
              className="absolute rounded-full border border-border/50 transition-all duration-700 ease-out"
              style={{
                left: "50%", top: "50%",
                width: axisPhase.rings ? `${r * 100}%` : "0%",
                height: axisPhase.rings ? `${r * 100}%` : "0%",
                transform: "translate(-50%, -50%)",
                background: i % 2 === 0 ? "hsl(var(--muted) / 0.25)" : "transparent",
                transitionDelay: `${i * 150}ms`,
                opacity: axisPhase.rings ? 1 : 0,
              }} />
          ))}
          {cards.map((c, i) =>
            renderCard(c, i, {
              left: `${c.pctX ?? 50}%`,
              top: `${c.pctY ?? 50}%`,
              transform: "translate(-50%, -50%)",
            }))}
        </div>
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
