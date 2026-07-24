import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Plus, Trash2, Image as ImageIcon, X, Play, Circle, GripVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import type { MindNode, Project } from "@/lib/types";
import { pickMediaAndStore, pickMediaMultipleAndStore, resolveImage } from "@/lib/imageStorage";
import { RecordFormatMenu } from "@/components/RecordFormatMenu";
import { launchRecording } from "@/lib/launchRecording";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NodeColorPicker } from "@/components/shared/NodeColorPicker";
import { DropIndicator, visualInsertIndex } from "@/components/shared/DropIndicator";
import { NarrationDock } from "@/components/shared/NarrationDock";
import {
  ASPECT_OPTIONS,
  aspectDims,
  parseTierListConfig,
  serializeTierListConfig,
  type ItemAspect,
} from "@/lib/tierlistConfig";

const TIER_COLORS = [
  "rgb(255, 127, 127)", "rgb(255, 191, 127)", "rgb(255, 223, 127)",
  "rgb(255, 255, 127)", "rgb(191, 255, 127)",
  "#8b5cf6", "#ec4899", "#64748b",
];


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

function ItemThumb({
  node,
  aspect,
  selected,
  onClick,
  onRemove,
}: {
  node: MindNode;
  aspect: ItemAspect;
  selected?: boolean;
  onClick?: () => void;
  onRemove: () => void;
}) {
  const url = useResolvedImage(node);
  const { w, h } = aspectDims(104, aspect);
  return (
    <div
      onClick={onClick}
      className={`group relative rounded-md border overflow-hidden shrink-0 bg-card cursor-pointer transition ${
        selected
          ? "border-primary ring-2 ring-primary/40"
          : "border-border/60 hover:border-primary/50"
      }`}
      style={{ width: w, height: h }}
    >
      {url && (
        <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
      )}
      {!url && (
        <div className="absolute inset-0 grid place-items-center text-center px-1.5 leading-tight text-[11px] break-words whitespace-normal overflow-hidden">
          {node.text || "Item"}
        </div>
      )}
      {url && node.text && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-1 py-0.5 leading-tight break-words whitespace-normal max-h-[45%] overflow-hidden">
          {node.text}
        </div>
      )}
      {node.color && (
        <div
          className="absolute top-1 left-1 size-3 rounded-full border border-white/70 shadow"
          style={{ background: node.color }}
        />
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-0.5 right-0.5 size-5 rounded-full bg-black/60 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition"
        aria-label="Remover"
      >
        <X className="size-3" />
      </button>
      <div className="absolute bottom-0.5 right-0.5 size-4 rounded bg-black/50 text-white grid place-items-center opacity-0 group-hover:opacity-100">
        <GripVertical className="size-3" />
      </div>
    </div>
  );
}

export function TierListEditor({ project }: { project: Project }) {
  const addNode = useStore((s) => s.addNode);
  const updateNode = useStore((s) => s.updateNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const setParent = useStore((s) => s.setParent);
  const renameProject = useStore((s) => s.renameProject);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPro } = useSubscription(user?.id);

  const board = project.nodes.find((n) => n.role === "board" || !n.parentId);
  const tiers = useMemo(
    () =>
      project.nodes
        .filter((n) => n.role === "tier" && n.parentId === board?.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [project.nodes, board?.id],
  );

  const allItems = useMemo(
    () => project.nodes.filter((n) => n.role === "item"),
    [project.nodes],
  );

  const { itemsByTier, poolItems } = useMemo(() => {
    const m = new Map<string, MindNode[]>();
    for (const t of tiers) m.set(t.id, []);
    const pool: MindNode[] = [];
    for (const n of allItems) {
      if (n.parentId && m.has(n.parentId)) m.get(n.parentId)!.push(n);
      else pool.push(n);
    }
    // Pool → call order. Tiers → manual placement order (falls back to call order).
    const byOrder = (a: MindNode, b: MindNode) => (a.order ?? 0) - (b.order ?? 0);
    const byPlacement = (a: MindNode, b: MindNode) =>
      (a.placementOrder ?? a.order ?? 0) - (b.placementOrder ?? b.order ?? 0);
    for (const arr of m.values()) arr.sort(byPlacement);
    pool.sort(byOrder);
    return { itemsByTier: m, poolItems: pool };
  }, [allItems, tiers]);


  const [titleDraft, setTitleDraft] = useState(project.title);
  const [recordOpen, setRecordOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? allItems.find((n) => n.id === selectedId) ?? null : null;
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const selectedTier = selectedTierId ? tiers.find((t) => t.id === selectedTierId) ?? null : null;

  const config = useMemo(() => parseTierListConfig(board?.body), [board?.body]);
  const itemAspect: ItemAspect = config.itemAspect;
  function setItemAspect(a: ItemAspect) {
    if (!board) return;
    updateNode(project.id, board.id, {
      body: serializeTierListConfig({ ...config, itemAspect: a }),
    } as Partial<MindNode>);
  }

  function addTier() {
    if (!board) return;
    const id = addNode(project.id, { parentId: board.id });
    if (!id) return;
    updateNode(project.id, id, {
      text: `Tier ${tiers.length + 1}`,
      role: "tier",
      color: TIER_COLORS[tiers.length % TIER_COLORS.length],
      order: tiers.length,
      width: 200,
    } as Partial<MindNode>);
  }

  /** Add one item to the pool. Its order = next index across all items. */
  function addItem() {
    if (!board) return;
    const nextOrder = allItems.reduce((m, n) => Math.max(m, n.order ?? -1), -1) + 1;
    const id = addNode(project.id, { parentId: board.id });
    if (!id) return;
    updateNode(project.id, id, {
      text: `Item ${nextOrder + 1}`,
      role: "item",
      order: nextOrder,
      width: 200,
    } as Partial<MindNode>);
    setSelectedId(id);
    setSelectedTierId(null);
  }

  /**
   * Bulk-create one item per selected image file. This is the common flow for
   * tier list creators who save a folder of reference images and want to drop
   * everything into the pool at once. Each item uses the file basename as text.
   */
  async function addItemsFromImages() {
    if (!board) return;
    const refs = await pickMediaMultipleAndStore("image");
    if (refs.length === 0) return;
    let nextOrder = allItems.reduce((m, n) => Math.max(m, n.order ?? -1), -1) + 1;
    let firstId: string | null = null;
    for (const ref of refs) {
      const id = addNode(project.id, { parentId: board.id });
      if (!id) continue;
      const baseName = ref.name.replace(/\.[^.]+$/, "");
      updateNode(project.id, id, {
        text: baseName || `Item ${nextOrder + 1}`,
        role: "item",
        order: nextOrder,
        width: 200,
        imageRef: ref,
        imageName: ref.name,
      } as Partial<MindNode>);
      if (!firstId) firstId = id;
      nextOrder += 1;
    }
    if (firstId) {
      setSelectedId(firstId);
      setSelectedTierId(null);
    }
  }

  async function setSelectedImage() {
    if (!selected) return;
    const ref = await pickMediaAndStore("image");
    if (!ref) return;
    updateNode(project.id, selected.id, {
      imageRef: ref,
      imageName: ref.name,
    } as Partial<MindNode>);
  }
  function clearSelectedImage() {
    if (!selected) return;
    updateNode(project.id, selected.id, {
      imageRef: undefined,
      image: undefined,
      imageName: undefined,
    } as Partial<MindNode>);
  }

  /**
   * Move `itemId` into `targetTierId` (or pool if null), inserted at
   * `insertIndex` within the destination. Rewrites `placementOrder` for
   * the destination bucket so drop position is preserved. When dropping
   * into the pool, also rewrites `order` (call order) so pool reordering
   * changes the reveal queue.
   */
  function moveItem(itemId: string, targetTierId: string | null, insertIndex?: number) {
    const dest = targetTierId
      ? (itemsByTier.get(targetTierId) ?? []).filter((n) => n.id !== itemId)
      : poolItems.filter((n) => n.id !== itemId);
    const item = allItems.find((n) => n.id === itemId);
    if (!item) return;
    const idx = insertIndex == null ? dest.length : Math.max(0, Math.min(insertIndex, dest.length));
    const nextParent = targetTierId ?? (board ? board.id : null);
    if (nextParent && item.parentId !== nextParent) {
      setParent(project.id, itemId, nextParent);
    }
    const arr = [...dest.slice(0, idx), item, ...dest.slice(idx)];
    if (targetTierId) {
      arr.forEach((n, i) => {
        if ((n.placementOrder ?? -1) !== i) {
          updateNode(project.id, n.id, { placementOrder: i } as Partial<MindNode>);
        }
      });
    } else {
      arr.forEach((n, i) => {
        if ((n.order ?? -1) !== i) {
          updateNode(project.id, n.id, { order: i } as Partial<MindNode>);
        }
      });
    }
  }

  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ key: string; idx: number } | null>(null);

  /** Given a horizontal-wrap container and a pointer event, find the insertion
   * index by comparing pointer position to each child card's midpoint. */
  function computeInsertIndex(
    container: HTMLElement,
    clientX: number,
    clientY: number,
    draggedId: string | null,
  ): number {
    const cards = Array.from(container.querySelectorAll<HTMLElement>("[data-item-id]"));
    let idx = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const el = cards[i];
      if (draggedId && el.dataset.itemId === draggedId) continue;
      const r = el.getBoundingClientRect();
      // Row-aware: only cards vertically overlapping the pointer count.
      if (clientY < r.top || clientY > r.bottom) continue;
      if (clientX < r.left + r.width / 2) { idx = i; break; }
    }
    // Adjust when dragged card comes before the target within the same list.
    if (draggedId) {
      const draggedIdx = cards.findIndex((el) => el.dataset.itemId === draggedId);
      if (draggedIdx !== -1 && draggedIdx < idx) idx -= 1;
    }
    return idx;
  }


  /**
   * Enforce all-or-none placement: either every item is inside a tier
   * (animated presentation) or none is (manual live drag). Anything in
   * between produces a broken presentation, so we block it up-front.
   */
  function validatePlacement(): boolean {
    if (allItems.length === 0) return true;
    const placed = allItems.length - poolItems.length;
    if (placed === 0 || placed === allItems.length) return true;
    alert(
      `Você tem ${placed} de ${allItems.length} itens em tiers. ` +
      `Posicione todos os itens ou deixe todos no pool (para arrastar ao vivo).`
    );
    return false;
  }

  function handlePresent() {
    if (!validatePlacement()) return;
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    navigate({ to: "/projects/$id/present", params: { id: project.id } });
  }

  async function onPickFormat(fmt: any) {
    setRecordOpen(false);
    if (!validatePlacement()) return;
    try {
      await launchRecording(project, fmt, isPro);
    } catch (e: any) {
      console.error(e);
      if (e?.name !== "NotAllowedError") alert(e?.message || "Falha ao iniciar gravação.");
      return;
    }
    navigate({
      to: "/projects/$id/present",
      params: { id: project.id },
      search: { record: "1" },
    });
  }

  const placedCount = allItems.length - poolItems.length;

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <header className="border-b border-border/60 px-4 py-3 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/projects"><ChevronLeft className="size-4" /> Voltar</Link>
        </Button>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => renameProject(project.id, titleDraft.trim() || "Tier list")}
            className="max-w-md"
          />
          <span className="text-xs text-muted-foreground shrink-0">Tier List</span>
        </div>
        <NarrationDock projectId={project.id} narrationRef={project.narrationRef} />
        <ThemeToggle />
        <Button variant="destructive" size="sm" onClick={() => setRecordOpen(true)} className="gap-1.5">
          <Circle className="size-3 fill-current" /> Gravar
        </Button>
        <Button variant="outline" size="sm" onClick={handlePresent} className="gap-1.5">
          <Play className="size-4" /> Apresentar
        </Button>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden p-4">
        <div className="mx-auto max-w-[1600px] h-full grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px_300px] gap-4">
          {/* TIERS column — scrolls internally so the pool never goes off-screen */}
          <section className="min-h-0 overflow-auto pr-1 space-y-3">
            {tiers.map((tier) => {
              const items = itemsByTier.get(tier.id) ?? [];
              return (
                <div
                  key={tier.id}
                  className="flex items-stretch rounded-lg overflow-hidden border border-border/60"
                >
                  <div
                    className={`min-w-[7rem] max-w-[12rem] w-32 shrink-0 grid place-items-center px-2 py-3 text-center cursor-pointer transition ${
                      selectedTierId === tier.id ? "ring-2 ring-inset ring-foreground/30" : ""
                    }`}
                    style={{ background: tier.color || "#334155" }}
                    onClick={() => { setSelectedTierId(tier.id); setSelectedId(null); }}
                  >
                    <textarea
                      value={tier.text}
                      onChange={(e) => updateNode(project.id, tier.id, { text: e.target.value })}
                      className="bg-transparent text-center outline-none w-full font-bold uppercase tracking-wider text-base leading-tight resize-none text-neutral-900 break-words whitespace-normal"
                      placeholder="Nome do tier"
                      rows={2}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div
                    className="flex-1 min-h-[128px] bg-muted/30 p-2 flex flex-wrap gap-2 items-start"
                    onDragOver={(e) => {
                      if (!dragItemId) return;
                      e.preventDefault();
                      const idx = visualInsertIndex(e.currentTarget, e.clientX, e.clientY);
                      if (hover?.key !== tier.id || hover.idx !== idx) setHover({ key: tier.id, idx });
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!dragItemId) return;
                      const idx = computeInsertIndex(e.currentTarget, e.clientX, e.clientY, dragItemId);
                      moveItem(dragItemId, tier.id, idx);
                      setDragItemId(null);
                      setHover(null);
                    }}
                  >
                    {items.map((it, i) => (
                      <div key={it.id} className="contents">
                        {hover?.key === tier.id && hover.idx === i && <DropIndicator />}
                        <div
                          data-item-id={it.id}
                          draggable
                          onDragStart={() => setDragItemId(it.id)}
                          onDragEnd={() => { setDragItemId(null); setHover(null); }}
                          className="cursor-grab active:cursor-grabbing relative"
                        >
                          <div className="absolute -top-1.5 -left-1.5 z-10 size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center shadow">
                            {(it.order ?? 0) + 1}
                          </div>
                          <ItemThumb
                            node={it}
                            aspect={itemAspect}
                            selected={selectedId === it.id}
                            onClick={() => { setSelectedId(it.id); setSelectedTierId(null); }}
                            onRemove={() => deleteNode(project.id, it.id)}
                          />
                        </div>
                      </div>
                    ))}
                    {hover?.key === tier.id && hover.idx === items.length && dragItemId && <DropIndicator />}
                    {items.length === 0 && (
                      <div className="self-center text-xs text-muted-foreground italic px-2">Arraste itens aqui.</div>
                    )}
                  </div>

                  <div className="w-10 shrink-0 flex flex-col items-center justify-center gap-1 p-1 bg-muted/10 border-l border-border/40">
                    <button
                      onClick={() => deleteNode(project.id, tier.id)}
                      className="text-muted-foreground hover:text-destructive p-1"
                      title="Remover tier"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="pt-1">
              <Button variant="outline" onClick={addTier} className="gap-2">
                <Plus className="size-4" /> Adicionar tier
              </Button>
            </div>
          </section>

          {/* POOL column — side-by-side with tiers so items are always reachable */}
          <section className="min-h-0 flex flex-col rounded-lg border border-dashed border-border/60 bg-muted/20">
            <div className="p-3 border-b border-border/40 space-y-2">
              <div>
                <div className="text-sm font-semibold">Itens disponíveis</div>
                <div className="text-[11px] text-muted-foreground">
                  Arraste para os tiers ao lado — ou deixe aqui para posicionar ao vivo na apresentação.
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] text-muted-foreground">
                  {allItems.length} total · {placedCount} nos tiers
                </span>
                <div
                  className="inline-flex rounded-md border border-border/60 overflow-hidden"
                  title="Formato de exibição das imagens"
                >
                  {ASPECT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setItemAspect(opt.id)}
                      className={`px-2 py-1 text-[11px] leading-none transition ${
                        itemAspect === opt.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-background hover:bg-muted"
                      }`}
                    >
                      {opt.label}
                      <span className="ml-1 opacity-60">{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={addItem} className="gap-1.5">
                  <Plus className="size-3.5" /> Item
                </Button>
                <Button size="sm" variant="outline" onClick={addItemsFromImages} className="gap-1.5" title="Selecione várias imagens de uma pasta para criar um item por imagem">
                  <ImageIcon className="size-3.5" /> Importar imagens
                </Button>
              </div>
            </div>
            <div
              className="flex-1 min-h-0 overflow-auto p-2 flex flex-wrap gap-2 content-start"
              onDragOver={(e) => {
                if (!dragItemId) return;
                e.preventDefault();
                const idx = visualInsertIndex(e.currentTarget, e.clientX, e.clientY);
                if (hover?.key !== "pool" || hover.idx !== idx) setHover({ key: "pool", idx });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!dragItemId) return;
                const idx = computeInsertIndex(e.currentTarget, e.clientX, e.clientY, dragItemId);
                moveItem(dragItemId, null, idx);
                setDragItemId(null);
                setHover(null);
              }}
            >
              {poolItems.map((it, i) => (
                <div key={it.id} className="contents">
                  {hover?.key === "pool" && hover.idx === i && <DropIndicator />}
                  <div
                    data-item-id={it.id}
                    draggable
                    onDragStart={() => setDragItemId(it.id)}
                    onDragEnd={() => { setDragItemId(null); setHover(null); }}
                    className="cursor-grab active:cursor-grabbing relative"
                  >
                    <div className="absolute -top-1.5 -left-1.5 z-10 size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center shadow">
                      {(it.order ?? 0) + 1}
                    </div>
                    <ItemThumb
                      node={it}
                      aspect={itemAspect}
                      selected={selectedId === it.id}
                      onClick={() => { setSelectedId(it.id); setSelectedTierId(null); }}
                      onRemove={() => deleteNode(project.id, it.id)}
                    />
                  </div>
                </div>
              ))}
              {hover?.key === "pool" && hover.idx === poolItems.length && dragItemId && <DropIndicator />}
              {poolItems.length === 0 && (
                <div className="w-full text-center text-xs text-muted-foreground italic py-6">
                  Nenhum item no pool.
                </div>
              )}
            </div>
          </section>

          {/* Inspector */}
          <aside className="min-h-0 overflow-auto rounded-lg border border-border/60 bg-card/40 p-4 space-y-4">
            {!selected && !selectedTier && (
              <div className="text-sm text-muted-foreground">
                Selecione um item ou tier para editar.
              </div>
            )}

            {selected && (
              <div className="space-y-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Item selecionado</div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Título</label>
                  <Input
                    value={selected.text}
                    onChange={(e) => updateNode(project.id, selected.id, { text: e.target.value })}
                    placeholder="Nome do item"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={setSelectedImage} className="gap-1.5">
                    <ImageIcon className="size-3.5" />
                    {selected.imageRef ? "Trocar imagem" : "Adicionar imagem"}
                  </Button>
                  {selected.imageRef && (
                    <Button size="sm" variant="ghost" onClick={clearSelectedImage} className="gap-1.5 text-destructive">
                      <X className="size-3.5" /> Remover
                    </Button>
                  )}
                </div>

                <NodeColorPicker
                  value={selected.color}
                  onChange={(c) => updateNode(project.id, selected.id, { color: c })}
                  label="Cor do card"
                />

                <div className="text-[11px] text-muted-foreground pt-2 border-t border-border/40">
                  Ordem de chamada: <strong className="text-foreground">#{(selected.order ?? 0) + 1}</strong>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive w-full justify-start gap-1.5"
                  onClick={() => { deleteNode(project.id, selected.id); setSelectedId(null); }}
                >
                  <Trash2 className="size-3.5" /> Excluir item
                </Button>
              </div>
            )}

            {selectedTier && (
              <div className="space-y-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Tier selecionado</div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Nome</label>
                  <Input
                    value={selectedTier.text}
                    onChange={(e) => updateNode(project.id, selectedTier.id, { text: e.target.value })}
                    placeholder="Nome do tier"
                  />
                </div>
                <NodeColorPicker
                  value={selectedTier.color}
                  onChange={(c) => updateNode(project.id, selectedTier.id, { color: c })}
                  label="Cor do tier"
                />
              </div>
            )}
          </aside>
        </div>
      </main>


      <RecordFormatMenu open={recordOpen} onClose={() => setRecordOpen(false)} onPick={onPickFormat} />
    </div>
  );
}
