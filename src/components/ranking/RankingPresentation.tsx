import { useEffect, useMemo, useState } from "react";
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

function Row({ node, rank, isNewest }: { node: MindNode; rank: number; isNewest: boolean }) {
  const url = useResolvedImage(node);
  return (
    <div
      className={`flex items-center gap-4 rounded-xl border p-3 backdrop-blur transition-all duration-500 ${
        isNewest ? "border-amber-300 bg-amber-500/15 shadow-[0_0_30px_rgba(252,211,77,0.4)] scale-[1.02]" : "border-white/15 bg-white/[0.04]"
      }`}
    >
      <div className={`text-4xl font-black tabular-nums w-14 text-center ${rank === 1 ? "text-amber-300" : "text-white/85"}`}>
        {rank}
      </div>
      {url && (
        <div className="size-14 rounded-lg overflow-hidden bg-black/50 shrink-0">
          <img src={url} alt="" className="size-full object-cover" />
        </div>
      )}
      <div className="text-lg font-medium text-white/95 flex-1 line-clamp-2">{node.text || "Item"}</div>
    </div>
  );
}

export function RankingPresentation({
  project, recording = false,
}: { project: Project; recording?: boolean }) {
  const root = project.nodes.find((n) => n.role === "ranking" || !n.parentId);
  const items = useMemo(
    () => project.nodes
      .filter((n) => n.role === "item" && n.parentId === root?.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [project.nodes, root?.id],
  );

  // Reveal one-by-one, top of ranking downward.
  const [revealed, setRevealed] = useState(1);
  useEffect(() => { setRevealed(Math.min(1, items.length)); }, [items.length]);
  const shown = items.slice(0, Math.min(revealed, items.length));

  const navLabel = items.length > 0
    ? `${Math.min(revealed, items.length)} / ${items.length}`
    : "0 / 0";

  return (
    <PresentationShell
      project={project}
      recording={recording}
      navLabel={navLabel}
      onNext={() => setRevealed((n) => Math.min(items.length, n + 1))}
      onPrev={() => setRevealed((n) => Math.max(1, n - 1))}
      canNext={revealed < items.length}
      canPrev={revealed > 1}
      frameBg="bg-gradient-to-b from-slate-950 via-neutral-950 to-black"
    >
      {() => (
        <div className="absolute inset-0 flex flex-col p-8">
          <div className="text-3xl font-bold text-center mb-6 opacity-95">{project.title}</div>
          {items.length === 0 ? (
            <div className="flex-1 grid place-items-center text-white/60">Adicione itens antes de apresentar.</div>
          ) : (
            <div className="flex-1 min-h-0 mx-auto w-full max-w-xl space-y-2 overflow-y-auto">
              {shown.map((n, i) => (
                <Row key={n.id} node={n} rank={i + 1} isNewest={i === shown.length - 1} />
              ))}
              {revealed < items.length && (
                <div className="text-center text-xs text-white/40 pt-2">
                  {items.length - revealed} restante(s) — pressione → para revelar
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </PresentationShell>
  );
}
