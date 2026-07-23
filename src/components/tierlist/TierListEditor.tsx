import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Plus, Trash2, Image as ImageIcon, X, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import type { MindNode, Project } from "@/lib/types";
import { pickMediaAndStore, resolveImage } from "@/lib/imageStorage";
import { toast } from "sonner";

const TIER_COLORS = [
  "#f43f5e", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#64748b",
];

function useResolvedImage(node: MindNode | undefined) {
  const [url, setUrl] = useState<string | null>(node?.image ?? null);
  const key = node?.imageRef?.id ?? node?.image ?? "";
  useMemo(() => {
    if (!node) { setUrl(null); return; }
    if (node.image) { setUrl(node.image); return; }
    if (!node.imageRef) { setUrl(null); return; }
    let alive = true;
    resolveImage(node.imageRef).then((u) => { if (alive) setUrl(u); });
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

function ItemThumb({ node, onRemove }: { node: MindNode; onRemove: () => void }) {
  const url = useResolvedImage(node);
  return (
    <div
      className="group relative rounded-md border border-border/60 bg-card overflow-hidden shrink-0"
      style={{ width: 96, height: 96 }}
      data-item-id={node.id}
    >
      {url ? (
        <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-[11px] text-center px-1 leading-tight">
          {node.text || "Item"}
        </div>
      )}
      {url && node.text && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate">
          {node.text}
        </div>
      )}
      <button
        onClick={onRemove}
        className="absolute top-0.5 right-0.5 size-5 rounded-full bg-black/60 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition"
        aria-label="Remover"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

export function TierListEditor({ project }: { project: Project }) {
  const addNode = useStore((s) => s.addNode);
  const updateNode = useStore((s) => s.updateNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const setParent = useStore((s) => s.setParent);
  const renameProject = useStore((s) => s.renameProject);

  const board = project.nodes.find((n) => n.role === "board" || !n.parentId);
  const tiers = useMemo(
    () =>
      project.nodes
        .filter((n) => n.role === "tier" && n.parentId === board?.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [project.nodes, board?.id],
  );

  const itemsByTier = useMemo(() => {
    const m = new Map<string, MindNode[]>();
    for (const t of tiers) m.set(t.id, []);
    // Unassigned pool = items whose parent is the board itself.
    m.set("__pool__", []);
    for (const n of project.nodes) {
      if (n.role !== "item") continue;
      if (n.parentId && m.has(n.parentId)) m.get(n.parentId)!.push(n);
      else m.get("__pool__")!.push(n);
    }
    return m;
  }, [project.nodes, tiers]);

  const [titleDraft, setTitleDraft] = useState(project.title);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTierId, setUploadTierId] = useState<string | null>(null);

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

  function addItem(tierId: string, text = "") {
    const id = addNode(project.id, { parentId: tierId });
    if (!id) return;
    updateNode(project.id, id, {
      text,
      role: "item",
      width: 200,
    } as Partial<MindNode>);
  }

  async function uploadItemImage(tierId: string) {
    setUploadTierId(tierId);
    const ref = await pickMediaAndStore("image");
    setUploadTierId(null);
    if (!ref) return;
    const id = addNode(project.id, { parentId: tierId });
    if (!id) return;
    updateNode(project.id, id, {
      text: ref.name.replace(/\.[^.]+$/, "").slice(0, 30),
      role: "item",
      imageRef: ref,
      imageName: ref.name,
      width: 200,
    } as Partial<MindNode>);
  }

  function moveItem(itemId: string, targetTierId: string) {
    setParent(project.id, itemId, targetTierId);
  }

  // Native HTML5 drag-and-drop for items.
  const [dragItemId, setDragItemId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
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
        <Button asChild variant="outline" size="sm">
          <Link to="/projects/$id/present" params={{ id: project.id }}>
            <Play className="size-4" /> Apresentar
          </Link>
        </Button>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-2">
          {tiers.map((tier) => {
            const items = itemsByTier.get(tier.id) ?? [];
            return (
              <div
                key={tier.id}
                className="flex items-stretch rounded-lg overflow-hidden border border-border/60"
                onDragOver={(e) => {
                  if (dragItemId) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragItemId) {
                    moveItem(dragItemId, tier.id);
                    setDragItemId(null);
                  }
                }}
              >
                <div
                  className="w-24 shrink-0 grid place-items-center px-2 py-3 font-bold text-lg text-white text-center"
                  style={{ background: tier.color || "#334155" }}
                >
                  <input
                    value={tier.text}
                    onChange={(e) => updateNode(project.id, tier.id, { text: e.target.value })}
                    className="bg-transparent text-center outline-none w-full font-bold uppercase tracking-wider"
                    maxLength={6}
                  />
                </div>
                <div className="flex-1 min-h-[112px] bg-muted/30 p-2 flex flex-wrap gap-2 items-start">
                  {items.map((it) => (
                    <div
                      key={it.id}
                      draggable
                      onDragStart={() => setDragItemId(it.id)}
                      onDragEnd={() => setDragItemId(null)}
                      onDoubleClick={() => {
                        const t = prompt("Texto do item:", it.text || "");
                        if (t !== null) updateNode(project.id, it.id, { text: t });
                      }}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <ItemThumb
                        node={it}
                        onRemove={() => deleteNode(project.id, it.id)}
                      />
                    </div>
                  ))}
                </div>
                <div className="w-32 shrink-0 flex flex-col gap-1 p-2 bg-muted/10 border-l border-border/40">
                  <Button size="sm" variant="ghost" onClick={() => addItem(tier.id, "Novo item")}>
                    <Plus className="size-3.5" /> Texto
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => uploadItemImage(tier.id)}
                    disabled={uploadTierId === tier.id}
                  >
                    <ImageIcon className="size-3.5" /> Imagem
                  </Button>
                  <div className="flex items-center gap-1 flex-wrap px-1 pt-1">
                    {TIER_COLORS.slice(0, 6).map((c) => (
                      <button
                        key={c}
                        onClick={() => updateNode(project.id, tier.id, { color: c })}
                        className="size-4 rounded-full border border-border/50"
                        style={{ background: c }}
                        aria-label={`Cor ${c}`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => deleteNode(project.id, tier.id)}
                    className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1 px-2 py-1"
                  >
                    <Trash2 className="size-3" /> Remover tier
                  </button>
                </div>
              </div>
            );
          })}

          <div className="pt-4">
            <Button variant="outline" onClick={addTier} className="gap-2">
              <Plus className="size-4" /> Adicionar tier
            </Button>
          </div>
        </div>
      </main>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" />
    </div>
  );
}
