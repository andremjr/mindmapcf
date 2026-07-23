import { useEffect, useMemo, useState } from "react";
import type { MindNode, Project } from "@/lib/types";
import { resolveImage } from "@/lib/imageStorage";
import { PresentationShell } from "@/components/shared/PresentationShell";
import { parseAxis, type AxisConfig, type ChartType } from "./MatrixEditor";

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
  return (
    <div
      className={`rounded-lg overflow-hidden border shadow-lg transition-all ${
        active
          ? "ring-2 ring-amber-300 scale-110 border-amber-300 shadow-[0_0_30px_rgba(252,211,77,0.55)]"
          : "border-border/60 bg-card"
      }`}
      style={{ width: 118 }}
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

  const [idx, setIdx] = useState(0);
  const current = cards[idx];
  const [expandedNode, setExpandedNode] = useState<MindNode | null>(null);

  const navLabel = cards.length > 0 ? `${idx + 1} / ${cards.length}` : "0 / 0";

  return (
    <PresentationShell
      project={project}
      recording={recording}
      navLabel={navLabel}
      onNext={() => setIdx((i) => Math.min(cards.length - 1, i + 1))}
      onPrev={() => setIdx((i) => Math.max(0, i - 1))}
      canNext={idx < cards.length - 1}
      canPrev={idx > 0}
      frameBg="bg-background"
    >
      {() => (
        <div className="absolute inset-0 flex flex-col p-6 text-foreground">
          <div className="text-2xl font-bold text-center mb-2 opacity-90">{project.title}</div>
          {cards.length === 0 ? (
            <div className="flex-1 grid place-items-center text-muted-foreground">Adicione cards antes de apresentar.</div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col">
              <ChartView chart={chart} axis={axis} cards={cards} activeIdx={idx}
                onCardClick={(i, c) => { setIdx(i); if (c.body) setExpandedNode(c); }} />
              {current?.body && (
                <div className="mt-3 mx-auto max-w-xl text-sm bg-card/80 border border-border/60 rounded-md px-3 py-2 text-center">
                  {current.body}
                </div>
              )}
            </div>
          )}

          {expandedNode && (
            <div className="absolute inset-0 z-20 bg-background/85 backdrop-blur grid place-items-center p-6" onClick={() => setExpandedNode(null)}>
              <div className="max-w-lg w-full rounded-xl border border-border/60 bg-card p-4" onClick={(e) => e.stopPropagation()}>
                <div className="text-lg font-semibold mb-2">{expandedNode.text}</div>
                <div className="text-sm text-foreground/85 whitespace-pre-wrap">{expandedNode.body}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </PresentationShell>
  );
}

function ChartView({
  chart, axis, cards, activeIdx, onCardClick,
}: {
  chart: ChartType;
  axis: AxisConfig;
  cards: MindNode[];
  activeIdx: number;
  onCardClick: (i: number, c: MindNode) => void;
}) {
  const renderCard = (c: MindNode, i: number, style: React.CSSProperties) => (
    <button
      key={c.id}
      onClick={() => onCardClick(i, c)}
      className="absolute transition-all duration-500"
      style={{
        ...style,
        zIndex: i === activeIdx ? 5 : 1,
        opacity: i === activeIdx ? 1 : 0.55,
      }}
    >
      <Card node={c} active={i === activeIdx} />
    </button>
  );

  if (chart === "line") {
    return (
      <div className="flex-1 flex flex-col">
        <div className="text-center text-xs font-semibold text-muted-foreground mb-1">{axis.lineLabel}</div>
        <div className="relative flex-1 rounded-xl border-2 border-border/40 bg-muted/20 overflow-hidden">
          <div className="absolute inset-y-0 left-0 right-0 flex items-center px-4 pointer-events-none">
            <div className="h-0.5 w-full bg-border" />
          </div>
          <div className="absolute top-2 left-3 text-[11px] text-muted-foreground">← {axis.xLow}</div>
          <div className="absolute top-2 right-3 text-[11px] text-muted-foreground">{axis.xHigh} →</div>
          {cards.map((c, i) =>
            renderCard(c, i, {
              left: `${c.pctX ?? 50}%`,
              top: "50%",
              transform: `translate(-50%, -50%) ${i === activeIdx ? "scale(1.06)" : "scale(1)"}`,
            }))}
        </div>
      </div>
    );
  }

  if (chart === "bullseye") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center text-xs font-semibold text-muted-foreground mb-2">{axis.bullseyeLabel}</div>
        <div className="relative rounded-full border-2 border-border/40 bg-muted/10 overflow-hidden"
          style={{ width: "min(70vh, 90%)", aspectRatio: "1 / 1" }}>
          {[0.85, 0.6, 0.35, 0.15].map((r, i) => (
            <div key={i} className="absolute rounded-full border border-border/50"
              style={{
                left: "50%", top: "50%",
                width: `${r * 100}%`, height: `${r * 100}%`,
                transform: "translate(-50%, -50%)",
                background: i % 2 === 0 ? "hsl(var(--muted) / 0.25)" : "transparent",
              }} />
          ))}
          {cards.map((c, i) =>
            renderCard(c, i, {
              left: `${c.pctX ?? 50}%`,
              top: `${c.pctY ?? 50}%`,
              transform: `translate(-50%, -50%) ${i === activeIdx ? "scale(1.06)" : "scale(1)"}`,
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
      <div className="text-center text-xs font-semibold text-muted-foreground mb-1">{yTop}</div>
      <div className="flex-1 flex items-stretch gap-2">
        <div className="grid place-items-center text-xs font-semibold text-muted-foreground px-1"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
          {xLeft}
        </div>
        <div className="relative flex-1 rounded-xl border-2 border-border/40 bg-muted/10 overflow-hidden">
          {isScatter ? (
            <div className="absolute inset-0 pointer-events-none">
              {[20, 40, 60, 80].map((p) => (
                <div key={`v${p}`} className="absolute inset-y-0 w-px bg-border/30" style={{ left: `${p}%` }} />
              ))}
              {[20, 40, 60, 80].map((p) => (
                <div key={`h${p}`} className="absolute inset-x-0 h-px bg-border/30" style={{ top: `${p}%` }} />
              ))}
              <div className="absolute inset-y-0 left-0 w-px bg-border/70" />
              <div className="absolute inset-x-0 bottom-0 h-px bg-border/70" />
            </div>
          ) : (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border/50" />
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border/50" />
            </div>
          )}
          {cards.map((c, i) =>
            renderCard(c, i, {
              left: `${c.pctX ?? 50}%`,
              top: `${c.pctY ?? 50}%`,
              transform: `translate(-50%, -50%) ${i === activeIdx ? "scale(1.06)" : "scale(1)"}`,
            }))}
        </div>
        <div className="grid place-items-center text-xs font-semibold text-muted-foreground px-1"
          style={{ writingMode: "vertical-rl" }}>
          {xRight}
        </div>
      </div>
      <div className="text-center text-xs font-semibold text-muted-foreground mt-1">{yBottom}</div>
    </div>
  );
}
