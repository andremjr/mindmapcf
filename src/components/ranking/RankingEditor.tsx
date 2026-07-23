import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft, Plus, Trash2, Image as ImageIcon, Play, Circle, GripVertical, X,
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
import { launchRecording } from "@/lib/launchRecording";
import type { RecordFormat } from "@/lib/recordFormats";

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

function Thumb({ node, size = 32 }: { node: MindNode; size?: number }) {
  const url = useResolvedImage(node);
  if (!url) {
    return (
      <div
        className="rounded bg-muted grid place-items-center text-[10px] text-muted-foreground shrink-0"
        style={{ width: size, height: size }}
      >—</div>
    );
  }
  return <img src={url} alt="" className="rounded object-cover shrink-0" style={{ width: size, height: size }} />;
}

type DragPayload = { id: string; from: "call" | "rank" };

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? itemsById.get(selectedId) ?? null : null;

  function nextRank(): number | undefined {
    for (let i = 1; i <= N + 1; i++) if (!byRank.has(i)) return i;
    return undefined;
  }

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


  function reindexCallOrder(newList: MindNode[]) {
    newList.forEach((n, i) => {
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
    // Swap: the previous occupant takes this item's old rank (or clears).
    if (occupant && occupant.id !== itemId) {
      updateNode(project.id, occupant.id, { rank: prev } as Partial<MindNode>);
    }
  }

  function removeItem(id: string) {
    if (selectedId === id) setSelectedId(null);
    deleteNode(project.id, id);
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

  async function onPickFormat(fmt: RecordFormat) {
    setRecordOpen(false);
    try { await launchRecording(project, fmt, isPro); }
    catch (e: any) {
      if (e?.name !== "NotAllowedError") alert(e?.message || "Falha ao iniciar gravação.");
      return;
    }
    navigate({ to: "/projects/$id/present", params: { id: project.id }, search: { record: "1" } });
  }

  function handlePresent() {
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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/60 px-4 py-3 flex items-center gap-3">
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
        <Button variant="destructive" size="sm" onClick={() => setRecordOpen(true)} className="gap-1.5">
          <Circle className="size-3 fill-current" /> Gravar
        </Button>
        <Button variant="outline" size="sm" onClick={handlePresent} className="gap-1.5">
          <Play className="size-4" /> Apresentar
        </Button>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="px-6 pt-4 pb-2 shrink-0">
          <div className="mx-auto max-w-6xl rounded-lg border border-border/60 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
            <span className="text-foreground font-medium">Como funciona: </span>
            arraste na coluna <strong>Ordem de chamada</strong> para definir a sequência de revelação.
            Arraste itens para as posições da coluna <strong>Ranking</strong> para definir onde cada um termina.
            Clique num item para editar texto, descrição e imagem.
            {(rankIssues.dupes.size > 0 || rankIssues.missing > 0) && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                {rankIssues.missing > 0 && `${rankIssues.missing} sem posição. `}
                {rankIssues.dupes.size > 0 && `Duplicadas: ${[...rankIssues.dupes].sort((a, b) => a - b).join(", ")}.`}
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-hidden px-6 pb-6">
          <div className="mx-auto max-w-6xl h-full grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ============= CALL ORDER COLUMN ============= */}
            <section className="flex flex-col rounded-lg border border-border/60 bg-card/50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/60 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Ordem de chamada</div>
                  <div className="text-[11px] text-muted-foreground">Sequência de revelação na apresentação.</div>
                </div>
                <Button size="sm" variant="outline" onClick={addItem} className="gap-1.5 h-7">
                  <Plus className="size-3.5" /> Item
                </Button>
              </div>
              <div className="px-4 pt-2 pb-1 text-[11px] text-muted-foreground shrink-0">
                {N > 0 && (
                  <>Faltam posicionar: <span className="font-semibold text-foreground">{N - byRank.size}</span> de {N}</>
                )}
              </div>
              <div className="flex-1 overflow-auto p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 auto-rows-min content-start">
                {items.length === 0 && (
                  <div className="col-span-full text-center text-xs text-muted-foreground italic py-8">
                    Adicione itens para começar.
                  </div>
                )}
                {items.map((it, i) => {
                  const placed = typeof it.rank === "number";
                  return (
                    <div
                      key={it.id}
                      draggable
                      onDragStart={(e) => {
                        setDrag({ id: it.id, from: "call" });
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDrag(null)}
                      onDragOver={(e) => {
                        if (drag && drag.from === "call" && drag.id !== it.id) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (drag && drag.from === "call") moveCall(drag.id, i);
                        setDrag(null);
                      }}
                      onClick={() => setSelectedId(it.id)}
                      className={`group relative aspect-square flex flex-col rounded-lg border bg-background cursor-grab active:cursor-grabbing transition overflow-hidden ${
                        selectedId === it.id ? "border-primary ring-2 ring-primary/40" : "border-border/60 hover:border-border"
                      } ${drag?.id === it.id ? "opacity-40" : ""} ${placed ? "opacity-50 saturate-50" : ""}`}
                    >
                      <span className="absolute top-1 left-1 z-10 text-[10px] font-bold tabular-nums bg-background/80 backdrop-blur rounded px-1.5 py-0.5 text-muted-foreground">
                        {i + 1}º
                      </span>
                      {placed && (
                        <span className="absolute top-1 right-1 z-10 text-[10px] font-bold tabular-nums bg-primary/90 text-primary-foreground rounded px-1.5 py-0.5">
                          #{it.rank}
                        </span>
                      )}
                      <div className="flex-1 min-h-0 bg-muted grid place-items-center overflow-hidden">
                        <Thumb node={it} size={64} />
                      </div>
                      <div className={`px-1.5 py-1 text-[11px] leading-tight text-center border-t border-border/40 bg-card ${placed ? "line-through" : ""}`}>
                        <span className="line-clamp-2 break-words">
                          {it.text || <span className="text-muted-foreground italic">sem título</span>}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ============= RANKING COLUMN ============= */}
            <section className="flex flex-col rounded-lg border border-border/60 bg-card/50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/60">
                <div className="text-sm font-semibold">Ranking final</div>
                <div className="text-[11px] text-muted-foreground">Arraste um item para a posição desejada. Solte sobre um slot ocupado para trocar.</div>
              </div>
              <div className="flex-1 overflow-auto p-3 space-y-1.5">
                {N === 0 && (
                  <div className="text-center text-xs text-muted-foreground italic py-8">
                    Sem itens ainda.
                  </div>
                )}
                {Array.from({ length: N }, (_, i) => i + 1).map((rank) => {
                  const it = byRank.get(rank);
                  const medal = rank === 1 ? "text-amber-400" : rank === 2 ? "text-slate-300" : rank === 3 ? "text-amber-600" : "text-muted-foreground";
                  return (
                    <div
                      key={rank}
                      onDragOver={(e) => { if (drag) e.preventDefault(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (drag) assignRank(drag.id, rank);
                        setDrag(null);
                      }}
                      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 min-h-[44px] transition ${
                        it ? "bg-background border-border/60" : "bg-muted/20 border-dashed border-border/40"
                      }`}
                    >
                      <span className={`text-base font-bold tabular-nums w-8 text-center shrink-0 ${medal}`}>{rank}º</span>
                      {it ? (
                        <div
                          draggable
                          onDragStart={(e) => {
                            setDrag({ id: it.id, from: "rank" });
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => setDrag(null)}
                          onClick={() => setSelectedId(it.id)}
                          className={`flex-1 flex items-center gap-2 rounded px-1.5 py-1 cursor-grab active:cursor-grabbing transition ${
                            selectedId === it.id ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted/50"
                          } ${drag?.id === it.id ? "opacity-40" : ""}`}
                        >
                          <Thumb node={it} size={28} />
                          <span className="flex-1 text-sm truncate">{it.text || <span className="text-muted-foreground italic">sem título</span>}</span>
                        </div>
                      ) : (
                        <span className="flex-1 text-xs text-muted-foreground italic">Solte um item aqui</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        {/* ============= INSPECTOR (bottom sheet) ============= */}
        {selected && (
          <div className="border-t border-border/60 bg-card/80 backdrop-blur px-6 py-3 shrink-0">
            <div className="mx-auto max-w-6xl flex items-start gap-3">
              <div className="shrink-0"><Thumb node={selected} size={64} /></div>
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
                  className="text-sm min-h-[52px] resize-none"
                />
              </div>
            </div>
          </div>
        )}
      </main>

      <RecordFormatMenu open={recordOpen} onClose={() => setRecordOpen(false)} onPick={onPickFormat} />
    </div>
  );
}
