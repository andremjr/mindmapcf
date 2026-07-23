import { useEffect, useMemo, useState } from "react";
import type { MindNode, Project } from "@/lib/types";
import { resolveImage } from "@/lib/imageStorage";
import { PresentationShell } from "@/components/shared/PresentationShell";

interface AxisConfig { xLow: string; xHigh: string; yLow: string; yHigh: string }
const DEFAULT_AXIS: AxisConfig = {
  xLow: "Baixo custo", xHigh: "Alto custo",
  yLow: "Baixo potencial", yHigh: "Alto potencial",
};
function parseAxis(body: string | undefined): AxisConfig {
  try { return { ...DEFAULT_AXIS, ...(body ? JSON.parse(body) : {}) }; }
  catch { return DEFAULT_AXIS; }
}

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
        active ? "ring-2 ring-amber-300 scale-110 border-amber-300 shadow-[0_0_30px_rgba(252,211,77,0.55)]" : "border-white/25 bg-black/70"
      }`}
      style={{ width: 118 }}
    >
      {url && (
        <div className="aspect-square bg-black/40">
          <img src={url} alt="" className="size-full object-cover" />
        </div>
      )}
      <div className="p-1.5 text-[11px] text-white/95 leading-tight line-clamp-2 min-h-[1.8rem] text-center">
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
      frameBg="bg-gradient-to-br from-slate-950 via-neutral-950 to-slate-950"
    >
      {() => (
        <div className="absolute inset-0 flex flex-col p-6">
          <div className="text-2xl font-bold text-center mb-2 opacity-90">{project.title}</div>
          {cards.length === 0 ? (
            <div className="flex-1 grid place-items-center text-white/60">Adicione cards antes de apresentar.</div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="text-center text-xs font-semibold text-white/70 mb-1">↑ {axis.yHigh}</div>
              <div className="flex-1 flex items-stretch gap-2">
                <div className="grid place-items-center text-xs font-semibold text-white/70 px-1" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                  {axis.xLow}
                </div>
                <div className="relative flex-1 rounded-xl border-2 border-white/15 bg-white/[0.03] overflow-hidden">
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-white/15" />
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-white/15" />
                  </div>
                  {cards.map((c, i) => (
                    <button
                      key={c.id}
                      onClick={() => { setIdx(i); if (c.body) setExpandedNode(c); }}
                      className="absolute transition-all duration-500"
                      style={{
                        left: `${c.pctX ?? 50}%`,
                        top: `${c.pctY ?? 50}%`,
                        transform: `translate(-50%, -50%) ${i === idx ? "scale(1.06)" : "scale(1)"}`,
                        zIndex: i === idx ? 5 : 1,
                        opacity: i === idx ? 1 : 0.55,
                      }}
                    >
                      <Card node={c} active={i === idx} />
                    </button>
                  ))}
                </div>
                <div className="grid place-items-center text-xs font-semibold text-white/70 px-1" style={{ writingMode: "vertical-rl" }}>
                  {axis.xHigh}
                </div>
              </div>
              <div className="text-center text-xs font-semibold text-white/70 mt-1">↓ {axis.yLow}</div>
              {current?.body && (
                <div className="mt-3 mx-auto max-w-xl text-sm text-white/85 bg-black/50 border border-white/15 rounded-md px-3 py-2 text-center">
                  {current.body}
                </div>
              )}
            </div>
          )}

          {expandedNode && (
            <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur grid place-items-center p-6" onClick={() => setExpandedNode(null)}>
              <div className="max-w-lg w-full rounded-xl border border-white/20 bg-neutral-900 p-4" onClick={(e) => e.stopPropagation()}>
                <div className="text-lg font-semibold mb-2">{expandedNode.text}</div>
                <div className="text-sm text-white/85 whitespace-pre-wrap">{expandedNode.body}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </PresentationShell>
  );
}
