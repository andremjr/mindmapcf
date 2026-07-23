import { useEffect, useMemo, useState } from "react";
import type { MindNode, Project } from "@/lib/types";
import { resolveImage } from "@/lib/imageStorage";
import { useStore } from "@/lib/store";
import { PresentationShell } from "@/components/shared/PresentationShell";

type Slot = { id: string | null; label: string; node?: MindNode };
type Match = { key: string; a: Slot; b: Slot; winnerId: string | null };

function BYE(): Slot { return { id: null, label: "BYE" }; }

function nextPow2(n: number) { let p = 1; while (p < n) p *= 2; return Math.max(2, p); }

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

function Card({
  slot, active, isWinner, onClick,
}: { slot: Slot; active: boolean; isWinner: boolean; onClick?: () => void }) {
  const url = useResolvedImage(slot.node);
  const isBye = slot.id === null;
  return (
    <button
      disabled={!onClick || isBye}
      onClick={onClick}
      className={`relative w-full rounded-md overflow-hidden border transition-all text-left ${
        active ? "ring-2 ring-amber-300 shadow-[0_0_24px_rgba(252,211,77,0.55)] border-amber-300" : "border-white/20"
      } ${isWinner ? "bg-emerald-500/25 border-emerald-300" : "bg-black/60"} ${
        isBye ? "opacity-40" : "hover:border-white/60"
      }`}
      style={{ minHeight: 56 }}
    >
      <div className="flex items-center gap-2 p-1.5">
        <div className="size-11 rounded bg-black/60 overflow-hidden shrink-0 grid place-items-center">
          {url ? <img src={url} alt="" className="size-full object-cover" /> : (
            <span className="text-[10px] text-white/50">?</span>
          )}
        </div>
        <div className="text-xs font-medium leading-tight line-clamp-2 text-white/95">{slot.label}</div>
      </div>
    </button>
  );
}

export function BracketPresentation({
  project, recording = false,
}: { project: Project; recording?: boolean }) {
  const updateNode = useStore((s) => s.updateNode);
  const root = project.nodes.find((n) => n.role === "bracket" || !n.parentId);
  const competitors = useMemo(
    () => project.nodes
      .filter((n) => n.role === "item" && n.parentId === root?.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [project.nodes, root?.id],
  );

  // Winners map lives in root.body as JSON: { "r{round}i{idx}": nodeId }
  const winners: Record<string, string> = useMemo(() => {
    try { return root?.body ? JSON.parse(root.body) : {}; } catch { return {}; }
  }, [root?.body]);

  const rounds: Match[][] = useMemo(() => {
    if (competitors.length === 0) return [];
    const size = nextPow2(competitors.length);
    const seeded: Slot[] = Array.from({ length: size }, (_, i) => {
      const c = competitors[i];
      return c ? { id: c.id, label: c.text || `#${i + 1}`, node: c } : BYE();
    });
    const totalRounds = Math.log2(size);
    const out: Match[][] = [];
    let current: Slot[] = seeded;
    for (let r = 0; r < totalRounds; r++) {
      const matches: Match[] = [];
      const next: Slot[] = [];
      for (let i = 0; i < current.length; i += 2) {
        const a = current[i]; const b = current[i + 1];
        const key = `r${r}i${i / 2}`;
        // Auto-advance BYE
        let winnerId: string | null = winners[key] ?? null;
        if (!winnerId && (a.id === null || b.id === null)) {
          winnerId = a.id ?? b.id ?? null;
        }
        matches.push({ key, a, b, winnerId });
        const w = winnerId
          ? (a.id === winnerId ? a : b.id === winnerId ? b : BYE())
          : BYE();
        next.push(w);
      }
      out.push(matches);
      current = next;
    }
    return out;
  }, [competitors, winners]);

  // Flatten matches in order for navigation (skip BYE-only matches).
  const flatMatches = useMemo(() => {
    const arr: { round: number; idx: number; match: Match }[] = [];
    rounds.forEach((round, r) => {
      round.forEach((m, i) => {
        if (m.a.id !== null && m.b.id !== null) arr.push({ round: r, idx: i, match: m });
      });
    });
    return arr;
  }, [rounds]);

  const [navIdx, setNavIdx] = useState(0);
  const currentMatch = flatMatches[navIdx];
  const champion = rounds.length > 0
    ? (() => {
        const finalKey = `r${rounds.length - 1}i0`;
        const wid = winners[finalKey];
        return wid ? competitors.find((c) => c.id === wid) : null;
      })()
    : null;

  function pickWinner(matchKey: string, id: string) {
    if (!root) return;
    const next = { ...winners, [matchKey]: id };
    // Clear downstream selections whose parents changed.
    // (Simple approach: keep all; user can Reset to fully clear.)
    updateNode(project.id, root.id, { body: JSON.stringify(next) } as Partial<MindNode>);
  }

  const navLabel = flatMatches.length > 0
    ? `${Math.min(navIdx + 1, flatMatches.length)} / ${flatMatches.length}`
    : "0 / 0";

  return (
    <PresentationShell
      project={project}
      recording={recording}
      navLabel={navLabel}
      onNext={() => setNavIdx((i) => Math.min(flatMatches.length - 1, i + 1))}
      onPrev={() => setNavIdx((i) => Math.max(0, i - 1))}
      canNext={navIdx < flatMatches.length - 1}
      canPrev={navIdx > 0}
      frameBg="bg-gradient-to-br from-neutral-950 via-slate-900 to-neutral-950"
    >
      {() => (
        <div className="absolute inset-0 flex flex-col p-6">
          <div className="text-2xl font-bold text-center mb-4 opacity-90">{project.title}</div>
          {competitors.length < 2 ? (
            <div className="flex-1 grid place-items-center text-white/60">
              Adicione pelo menos 2 competidores.
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex gap-4 justify-center overflow-auto">
              {rounds.map((round, r) => (
                <div
                  key={r}
                  className="flex flex-col justify-around gap-3 min-w-[200px] shrink-0"
                  style={{ paddingTop: 8 * Math.pow(2, r), paddingBottom: 8 * Math.pow(2, r) }}
                >
                  <div className="text-[10px] uppercase tracking-widest text-white/40 text-center">
                    {r === rounds.length - 1 ? "Final" : `Rodada ${r + 1}`}
                  </div>
                  {round.map((m, i) => {
                    const isCurrent = currentMatch?.match.key === m.key;
                    const canPick = m.a.id !== null && m.b.id !== null;
                    return (
                      <div
                        key={m.key}
                        className={`rounded-lg p-1.5 space-y-1 transition-all ${
                          isCurrent ? "bg-white/5 ring-1 ring-white/20" : "opacity-70"
                        }`}
                        style={{ marginTop: i > 0 ? 8 * Math.pow(2, r) : 0 }}
                      >
                        <Card
                          slot={m.a}
                          active={isCurrent}
                          isWinner={m.winnerId !== null && m.winnerId === m.a.id}
                          onClick={canPick ? () => pickWinner(m.key, m.a.id!) : undefined}
                        />
                        <div className="text-center text-[10px] text-white/40">vs</div>
                        <Card
                          slot={m.b}
                          active={isCurrent}
                          isWinner={m.winnerId !== null && m.winnerId === m.b.id}
                          onClick={canPick ? () => pickWinner(m.key, m.b.id!) : undefined}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
              {champion && (
                <div className="flex flex-col justify-center gap-2 min-w-[220px]">
                  <div className="text-[10px] uppercase tracking-widest text-amber-300 text-center">Campeão</div>
                  <div className="rounded-xl p-3 bg-gradient-to-br from-amber-400/30 to-amber-600/20 border border-amber-300/50 shadow-[0_0_40px_rgba(252,211,77,0.35)]">
                    <Card slot={{ id: champion.id, label: champion.text || "Vencedor", node: champion }} active={false} isWinner />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </PresentationShell>
  );
}
