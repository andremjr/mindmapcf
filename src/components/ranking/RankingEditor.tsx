import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft, Plus, Trash2, Image as ImageIcon, Play, Circle, X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import type { MindNode, Project } from "@/lib/types";
import { pickMediaAndStore, resolveImage } from "@/lib/imageStorage";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { RecordFormatMenu } from "@/components/RecordFormatMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { launchRecording } from "@/lib/launchRecording";
import type { RecordFormat } from "@/lib/recordFormats";
import { NodeColorPicker } from "@/components/shared/NodeColorPicker";
import { visualInsertIndexVertical } from "@/components/shared/DropIndicator";

/* ---------- image resolution ---------- */
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

function Thumb({ node }: { node: MindNode }) {
  const url = useResolvedImage(node);
  if (!url) return null;
  return <img src={url} alt="" className="absolute inset-0 size-full object-cover" />;
}

/* ---------- auto-fit row dimensions ----------
   Keeps the editor in stacked horizontal lines. Rows shrink to keep all
   items visible inside the frame, instead of switching back to square cards. */
function useAutoRows(count: number) {
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
  const row = useMemo(() => {
    const n = Math.max(1, count);
    const { h } = dims;
    if (!h) return 76;
    const GAP = 8;
    return Math.max(28, Math.min(86, Math.floor((h - GAP * (n - 1)) / n)));
  }, [count, dims]);
  return { ref, row };
}

/* ---------- drag payload ---------- */
type DragPayload = { id: string; from: "call" | "rank" };

/* ---------- main component ---------- */
export function RankingEditor({ project }: { project: Project }) {
  const addNode = useStore((s) => s.addNode);
  const updateNode = useStore((s) => s.updateNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const renameProject = useStore((s) => s.renameProject);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPro } = useSubscription(user?.id);

  const root = project.nodes.find((n) => n.role === "ranking" || !n.parentId);

  const items = useMemo(
    () => project.nodes
      .filter((n) => n.role === "item" && n.parentId === root?.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [project.nodes, root?.id],
  );

  const N = items.length;
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const byRank = useMemo(() => {
    const m = new Map<number, MindNode>();
    for (const it of items) if (typeof it.rank === "number") m.set(it.rank, it);
    return m;
  }, [items]);

  const [titleDraft, setTitleDraft] = useState(project.title);
  const [recordOpen, setRecordOpen] = useState(false);
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [callHover, setCallHover] = useState<{ idx: number; y: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? itemsById.get(selectedId) ?? null : null;

  /* --- actions --- */
  function addItem() {
    if (!root) return;
    const id = addNode(project.id, { parentId: root.id });
    if (!id) return;
    updateNode(project.id, id, {
      text: `Item ${N + 1}`,
      role: "item",
      order: N,
      width: 300,
    } as Partial<MindNode>);
    setSelectedId(id);
  }

  function reindexCallOrder(next: MindNode[]) {
    next.forEach((n, i) => {
      if ((n.order ?? -1) !== i) updateNode(project.id, n.id, { order: i } as Partial<MindNode>);
    });
  }

  function moveCall(id: string, targetIdx: number) {
    const src = items.findIndex((n) => n.id === id);
    if (src === -1 || src === targetIdx) return;
    const next = [...items];
    const [n] = next.splice(src, 1);
    next.splice(Math.max(0, Math.min(N - 1, targetIdx)), 0, n);
    reindexCallOrder(next);
  }

  function assignRank(itemId: string, targetRank: number) {
    const item = itemsById.get(itemId);
    if (!item) return;
    const prev = item.rank;
    if (prev === targetRank) return;
    const occupant = byRank.get(targetRank);
    updateNode(project.id, itemId, { rank: targetRank } as Partial<MindNode>);
    if (occupant && occupant.id !== itemId) {
      updateNode(project.id, occupant.id, { rank: prev } as Partial<MindNode>);
    }
  }

  function clearRank(itemId: string) {
    updateNode(project.id, itemId, { rank: undefined } as Partial<MindNode>);
  }

  function removeItem(id: string) {
    if (selectedId === id) setSelectedId(null);
    // Preserve rank/order consistency: after deletion we just re-index call order.
    deleteNode(project.id, id);
    const remaining = items.filter((n) => n.id !== id);
    reindexCallOrder(remaining);
  }

  async function setItemImage() {
    if (!selected) return;
    const ref = await pickMediaAndStore("image");
    if (!ref) return;
    updateNode(project.id, selected.id, {
      imageRef: ref,
      imageName: ref.name,
    } as Partial<MindNode>);
  }

  function clearItemImage() {
    if (!selected) return;
    updateNode(project.id, selected.id, {
      imageRef: undefined,
      image: undefined,
      imageName: undefined,
    } as Partial<MindNode>);
  }

  /**
   * All-or-none rule: either every item has a rank (animated presentation)
   * or none of them do (manual live drag). Anything in between produces
   * a broken presentation, so we block it up-front.
   */
  function validatePlacement(): boolean {
    if (N === 0) return true;
    const placed = byRank.size;
    if (placed === 0 || placed === N) return true;
    alert(
      `Você tem ${placed} de ${N} itens posicionados no ranking. ` +
      `Posicione todos ou deixe todos sem posição (para arrastar ao vivo na apresentação).`
    );
    return false;
  }

  async function onPickFormat(fmt: RecordFormat) {
    setRecordOpen(false);
    if (!validatePlacement()) return;
    try { await launchRecording(project, fmt, isPro); }
    catch (e: any) {
      if (e?.name !== "NotAllowedError") alert(e?.message || "Falha ao iniciar gravação.");
      return;
    }
    navigate({ to: "/projects/$id/present", params: { id: project.id }, search: { record: "1" } });
  }

  function handlePresent() {
    if (!validatePlacement()) return;
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    navigate({ to: "/projects/$id/present", params: { id: project.id }, search: {} });
  }

  const rankIssues = useMemo(() => {
    const seen = new Map<number, number>();
    const dupes = new Set<number>();
    let missing = 0;
    items.forEach((n) => {
      if (typeof n.rank !== "number") { missing++; return; }
      const c = (seen.get(n.rank) ?? 0) + 1;
      seen.set(n.rank, c);
      if (c > 1) dupes.add(n.rank);
    });
    return { dupes, missing };
  }, [items]);

  /* --- auto-fit rows: no scroll, stacked lines fit inside the frame --- */
  const callRows = useAutoRows(N || 1);
  const rankRows = useAutoRows(N || 1);
  const rowStyle = (g: { row: number }) => ({
    gridTemplateColumns: "minmax(0, 1fr)",
    gridAutoRows: `${g.row}px`,
    justifyContent: "stretch" as const,
    alignContent: "center" as const,
  });

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* header */}
      <header className="border-b border-border/60 px-4 py-3 flex items-center gap-3 shrink-0">
        <Button asChild variant="ghost" size="sm">
          <Link to="/projects"><ChevronLeft className="size-4" /> Voltar</Link>
        </Button>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => renameProject(project.id, titleDraft.trim() || "Ranking")}
            className="max-w-md" />
          <span className="text-xs text-muted-foreground shrink-0">Ranking progressivo</span>
        </div>
        <Button size="sm" variant="outline" onClick={addItem} className="gap-1.5">
          <Plus className="size-3.5" /> Item
        </Button>
        <ThemeToggle />
        <Button variant="destructive" size="sm" onClick={() => setRecordOpen(true)} className="gap-1.5">
          <Circle className="size-3 fill-current" /> Gravar
        </Button>
        <Button variant="outline" size="sm" onClick={handlePresent} className="gap-1.5">
          <Play className="size-4" /> Apresentar
        </Button>
      </header>

      {/* main = two auto-fit stacked columns side by side, no scroll */}
      <main className="flex-1 min-h-0 flex flex-col p-4 gap-3">
        {/* status bar */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0 px-1">
          <span><strong className="text-foreground">{N}</strong> {N === 1 ? "item" : "itens"}</span>
          <span className="opacity-60">·</span>
          <span>Faltam posicionar: <strong className="text-foreground">{N - byRank.size}</strong></span>
          {rankIssues.dupes.size > 0 && (
            <>
              <span className="opacity-60">·</span>
              <span className="text-amber-600 dark:text-amber-400">
                Posições duplicadas: {[...rankIssues.dupes].sort((a, b) => a - b).join(", ")}
              </span>
            </>
          )}
          <span className="ml-auto opacity-70 hidden md:inline">
            Arraste dentro de <strong>Chamada</strong> para reordenar · Arraste para <strong>Ranking</strong> para posicionar · Clique num item para editar
          </span>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-2 gap-3">
          {/* ================ CALL ORDER ================ */}
          <section className="flex flex-col rounded-xl border border-border/60 bg-card/40 overflow-hidden">
            <header className="px-3 py-2 border-b border-border/60 flex items-center justify-between shrink-0">
              <div>
                <div className="text-sm font-semibold">Ordem de chamada</div>
                <div className="text-[11px] text-muted-foreground">Sequência de revelação</div>
              </div>
              <Button size="sm" variant="ghost" onClick={addItem} className="h-7 gap-1.5">
                <Plus className="size-3.5" /> Item
              </Button>
            </header>

            {N === 0 ? (
              <button
                onClick={addItem}
                className="flex-1 grid place-items-center text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition"
              >
                <div className="flex flex-col items-center gap-2">
                  <Plus className="size-8 opacity-50" />
                  <span>Clique para adicionar o primeiro item</span>
                </div>
              </button>
            ) : (
              <div
                ref={callRows.ref}
                className="flex-1 min-h-0 p-2 grid gap-2 relative"
                style={rowStyle(callRows)}
                onDragOver={(e) => {
                  if (!drag || drag.from !== "call") return;
                  e.preventDefault();
                  const container = e.currentTarget as HTMLElement;
                  const idx = visualInsertIndexVertical(container, e.clientY);
                  const cards = Array.from(container.querySelectorAll<HTMLElement>("[data-item-id]"));
                  const containerRect = container.getBoundingClientRect();
                  let y = 4;
                  if (idx === 0 && cards[0]) {
                    y = cards[0].getBoundingClientRect().top - containerRect.top - 2;
                  } else if (cards[idx - 1]) {
                    const r = cards[idx - 1].getBoundingClientRect();
                    y = r.bottom - containerRect.top + 1;
                  } else if (cards.length) {
                    const r = cards[cards.length - 1].getBoundingClientRect();
                    y = r.bottom - containerRect.top + 1;
                  }
                  if (callHover?.idx !== idx) setCallHover({ idx, y });
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setCallHover(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag && drag.from === "call" && callHover) {
                    const srcIdx = items.findIndex((n) => n.id === drag.id);
                    let target = callHover.idx;
                    if (srcIdx !== -1 && srcIdx < target) target -= 1;
                    moveCall(drag.id, target);
                  }
                  setDrag(null);
                  setCallHover(null);
                }}
              >
                {items.map((it, i) => {
                  const placed = typeof it.rank === "number";
                  return (
                    <CallCard
                      key={it.id}
                      node={it}
                      callIdx={i}
                      placed={placed}
                      selected={selectedId === it.id}
                      dragging={drag?.id === it.id}
                      isDropTarget={!!drag && drag.from === "call" && drag.id !== it.id}
                      onClick={() => setSelectedId(it.id)}
                      onDragStart={() => setDrag({ id: it.id, from: "call" })}
                      onDragEnd={() => { setDrag(null); setCallHover(null); }}
                      onDropOnCard={() => {
                        if (drag && drag.from === "call") moveCall(drag.id, i);
                        setDrag(null);
                        setCallHover(null);
                      }}
                    />
                  );
                })}
                {drag?.from === "call" && callHover && (
                  <div
                    className="absolute left-2 right-2 h-[3px] rounded-full bg-primary shadow-[0_0_10px_2px_hsl(var(--primary)/0.75)] animate-pulse pointer-events-none z-10"
                    style={{ top: callHover.y }}
                  />
                )}
              </div>
            )}
          </section>

          {/* ================ RANKING ================ */}
          <section className="flex flex-col rounded-xl border border-border/60 bg-card/40 overflow-hidden">
            <header className="px-3 py-2 border-b border-border/60 shrink-0">
              <div className="text-sm font-semibold">Ranking final</div>
              <div className="text-[11px] text-muted-foreground">Arraste um item aqui</div>
            </header>

            {N === 0 ? (
              <div className="flex-1 grid place-items-center text-xs text-muted-foreground italic">
                As posições aparecem quando você adicionar itens.
              </div>
            ) : (
              <div ref={rankRows.ref} className="flex-1 min-h-0 p-2 grid gap-2" style={rowStyle(rankRows)}>
                {Array.from({ length: N }, (_, i) => i + 1).map((rank) => {
                  const it = byRank.get(rank);
                  return (
                    <RankSlot
                      key={rank}
                      rank={rank}
                      node={it}
                      selected={!!it && selectedId === it.id}
                      dragging={!!it && drag?.id === it.id}
                      dropActive={drag != null}
                      onClickNode={() => it && setSelectedId(it.id)}
                      onDragStart={() => it && setDrag({ id: it.id, from: "rank" })}
                      onDragEnd={() => setDrag(null)}
                      onDrop={() => {
                        if (drag) assignRank(drag.id, rank);
                        setDrag(null);
                      }}
                      onClear={() => it && clearRank(it.id)}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* floating inspector */}
      {selected && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(720px,calc(100vw-2rem))] rounded-xl border border-border bg-card/95 shadow-2xl backdrop-blur px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="relative size-16 rounded-lg overflow-hidden bg-muted shrink-0 grid place-items-center text-[10px] text-muted-foreground">
              <Thumb node={selected} />
              {!selected.imageRef && !selected.image && <span>sem imagem</span>}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={selected.text}
                  onChange={(e) => updateNode(project.id, selected.id, { text: e.target.value })}
                  placeholder="Título do item"
                  className="h-8 text-sm"
                />
                <Button size="sm" variant="outline" onClick={setItemImage} className="gap-1.5 h-8 shrink-0">
                  <ImageIcon className="size-3.5" /> {selected.imageRef || selected.image ? "Trocar" : "Imagem"}
                </Button>
                {(selected.imageRef || selected.image) && (
                  <Button size="sm" variant="ghost" onClick={clearItemImage} className="h-8 shrink-0" aria-label="Remover imagem">
                    <X className="size-3.5" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => removeItem(selected.id)}
                  className="h-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5">
                  <Trash2 className="size-3.5" /> Excluir
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)} className="h-8 shrink-0" aria-label="Fechar">
                  <X className="size-4" />
                </Button>
              </div>
              <Textarea
                value={selected.body ?? ""}
                onChange={(e) => updateNode(project.id, selected.id, { body: e.target.value } as Partial<MindNode>)}
                placeholder="Descrição (opcional) — aparece no card expandido durante a chamada"
                className="text-sm min-h-[48px] resize-none"
              />
              <NodeColorPicker
                value={selected.color}
                onChange={(c) => updateNode(project.id, selected.id, { color: c } as Partial<MindNode>)}
              />
            </div>
          </div>
        </div>
      )}

      <RecordFormatMenu open={recordOpen} onClose={() => setRecordOpen(false)} onPick={onPickFormat} />
    </div>
  );
}

/* ---------- Call order card ---------- */
function CallCard({
  node, callIdx, placed, selected, dragging, isDropTarget,
  onClick, onDragStart, onDragEnd, onDropOnCard,
}: {
  node: MindNode; callIdx: number; placed: boolean;
  selected: boolean; dragging: boolean; isDropTarget: boolean;
  onClick: () => void;
  onDragStart: () => void; onDragEnd: () => void; onDropOnCard: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => { onDragStart(); e.dataTransfer.effectAllowed = "move"; }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { if (isDropTarget) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); onDropOnCard(); }}
      onClick={onClick}
      className={[
        "relative min-h-0 rounded-lg border-2 bg-background overflow-hidden",
        "cursor-grab active:cursor-grabbing transition",
        "flex items-stretch",
        selected
          ? "border-primary ring-2 ring-primary/40"
          : placed
            ? "border-emerald-500/70 hover:border-emerald-500"
            : "border-border/60 hover:border-border",
        dragging ? "opacity-30" : "",
        placed ? "opacity-70" : "",
        isDropTarget ? "ring-2 ring-primary/50" : "",
      ].join(" ")}
    >
      {/* call index badge */}
      <span className="absolute top-1 left-1 z-10 min-w-6 h-6 px-1.5 rounded-md bg-background/85 text-foreground text-[11px] font-bold tabular-nums grid place-items-center border border-border">
        {callIdx + 1}
      </span>
      {/* status badge: rank if placed */}
      {placed && (
        <span className="absolute top-1 right-1 z-10 h-6 px-1.5 rounded-md bg-emerald-500 text-white text-[11px] font-bold tabular-nums grid place-items-center shadow-sm">
          #{node.rank}
        </span>
      )}
      {/* thumbnail area */}
      <div className="relative h-full aspect-square shrink-0 bg-muted grid place-items-center overflow-hidden border-r border-border/50">
        <Thumb node={node} />
        {!node.imageRef && !node.image && (
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">sem imagem</span>
        )}
      </div>
      {/* title strip */}
      <div className={`flex-1 min-w-0 px-10 py-2 text-sm leading-tight bg-card flex items-center ${placed ? "line-through text-muted-foreground" : ""}`}>
        <span className="line-clamp-2 break-words text-left">
          {node.text || <span className="text-muted-foreground italic">sem título</span>}
        </span>
      </div>
    </div>
  );
}

/* ---------- Ranking slot ---------- */
function RankSlot({
  rank, node, selected, dragging, dropActive,
  onClickNode, onDragStart, onDragEnd, onDrop, onClear,
}: {
  rank: number; node: MindNode | undefined;
  selected: boolean; dragging: boolean; dropActive: boolean;
  onClickNode: () => void;
  onDragStart: () => void; onDragEnd: () => void;
  onDrop: () => void; onClear: () => void;
}) {
  const medal = rank === 1
    ? "bg-amber-400 text-amber-950"
    : rank === 2
    ? "bg-slate-300 text-slate-900"
    : rank === 3
    ? "bg-amber-700 text-amber-50"
    : "bg-muted text-foreground border border-border";

  return (
    <div
      onDragOver={(e) => { if (dropActive) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      className={[
        "relative min-h-0 rounded-lg overflow-hidden flex items-stretch transition",
        node
          ? "bg-background border-2 border-emerald-500/70"
          : `border-2 border-dashed ${dropActive ? "border-primary bg-primary/10" : "border-border/60 bg-muted/20"}`,
        selected ? "ring-2 ring-primary/50" : "",
        dragging ? "opacity-30" : "",
      ].join(" ")}
    >
      {/* rank medal */}
      <span className={`absolute top-1 left-1 z-10 size-7 rounded-full grid place-items-center text-[12px] font-black tabular-nums shadow-sm ${medal}`}>
        {rank}
      </span>

      {node ? (
        <>
          <button
            type="button"
            onClick={onClear}
            className="absolute top-1 right-1 z-10 size-6 rounded-md bg-background/80 hover:bg-destructive/20 hover:text-destructive text-muted-foreground grid place-items-center border border-border"
            aria-label="Limpar posição"
            title="Limpar posição"
          >
            <X className="size-3.5" />
          </button>
          <div
            draggable
            onDragStart={(e) => { onDragStart(); e.dataTransfer.effectAllowed = "move"; }}
            onDragEnd={onDragEnd}
            onClick={onClickNode}
            className="flex-1 min-w-0 flex cursor-grab active:cursor-grabbing"
          >
            <div className="relative h-full aspect-square shrink-0 bg-muted grid place-items-center overflow-hidden border-r border-border/50">
              <Thumb node={node} />
              {!node.imageRef && !node.image && (
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">sem imagem</span>
              )}
            </div>
            <div className="flex-1 min-w-0 px-10 py-2 text-sm leading-tight bg-card font-medium flex items-center">
              <span className="line-clamp-2 break-words text-left">
                {node.text || <span className="text-muted-foreground italic">sem título</span>}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 grid place-items-center px-2">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            vazio
          </div>
        </div>
      )}
    </div>
  );
}
