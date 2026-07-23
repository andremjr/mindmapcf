import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft, Plus, Trash2, Image as ImageIcon, Play, Circle, X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import type { MindNode, Project } from "@/lib/types";
import { pickMediaAndStore, resolveImage } from "@/lib/imageStorage";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { RecordFormatMenu } from "@/components/RecordFormatMenu";
import { launchRecording } from "@/lib/launchRecording";
import type { RecordFormat } from "@/lib/recordFormats";

interface AxisConfig { xLow: string; xHigh: string; yLow: string; yHigh: string }
const DEFAULT_AXIS: AxisConfig = {
  xLow: "Baixo custo", xHigh: "Alto custo",
  yLow: "Baixo potencial", yHigh: "Alto potencial",
};

function parseAxis(body: string | undefined): AxisConfig {
  try {
    const p = body ? JSON.parse(body) : {};
    return { ...DEFAULT_AXIS, ...p };
  } catch { return DEFAULT_AXIS; }
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

function MatrixCard({
  node, onDelete, onEdit,
}: { node: MindNode; onDelete: () => void; onEdit: () => void }) {
  const url = useResolvedImage(node);
  return (
    <div className="relative rounded-lg bg-card border border-border/70 shadow-md overflow-hidden hover:border-primary/60 transition group" style={{ width: 132 }}>
      {url && (
        <div className="aspect-square bg-muted">
          <img src={url} alt="" className="size-full object-cover" />
        </div>
      )}
      <div className="p-2">
        <div className="text-xs font-medium leading-tight line-clamp-2 min-h-[2rem]">{node.text || "Sem título"}</div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="absolute top-1 left-1 size-6 rounded-full bg-black/70 text-white text-[10px] opacity-0 group-hover:opacity-100 transition"
        aria-label="Editar">✎</button>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-1 right-1 size-6 rounded-full bg-black/70 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition"
        aria-label="Remover">
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}

export function MatrixEditor({ project }: { project: Project }) {
  const addNode = useStore((s) => s.addNode);
  const updateNode = useStore((s) => s.updateNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const renameProject = useStore((s) => s.renameProject);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPro } = useSubscription(user?.id);

  const root = project.nodes.find((n) => n.role === "matrix" || !n.parentId);
  const cards = useMemo(
    () => project.nodes.filter((n) => n.role === "item" && n.parentId === root?.id),
    [project.nodes, root?.id],
  );
  const axis = useMemo(() => parseAxis(root?.body), [root?.body]);

  const [titleDraft, setTitleDraft] = useState(project.title);
  const [recordOpen, setRecordOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const planeRef = useRef<HTMLDivElement>(null);

  function setAxis(patch: Partial<AxisConfig>) {
    if (!root) return;
    updateNode(project.id, root.id, { body: JSON.stringify({ ...axis, ...patch }) } as Partial<MindNode>);
  }

  function addCard(text = "Novo card", imageRef?: MindNode["imageRef"]) {
    if (!root) return;
    const id = addNode(project.id, { parentId: root.id });
    if (!id) return;
    updateNode(project.id, id, {
      text,
      role: "item",
      pctX: 50,
      pctY: 50,
      width: 132,
      imageRef,
      imageName: imageRef?.name,
    } as Partial<MindNode>);
  }

  async function addImageCard() {
    const ref = await pickMediaAndStore("image");
    if (!ref) return;
    addCard(ref.name.replace(/\.[^.]+$/, "").slice(0, 30), ref);
  }

  // Drag logic
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  function onCardMouseDown(e: React.MouseEvent, node: MindNode) {
    if (!planeRef.current) return;
    const rect = planeRef.current.getBoundingClientRect();
    const nodeRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = {
      id: node.id,
      offsetX: e.clientX - (nodeRect.left + nodeRect.width / 2),
      offsetY: e.clientY - (nodeRect.top + nodeRect.height / 2),
    };
    const move = (ev: MouseEvent) => {
      if (!dragRef.current || !planeRef.current) return;
      const r = planeRef.current.getBoundingClientRect();
      const cx = ev.clientX - dragRef.current.offsetX - r.left;
      const cy = ev.clientY - dragRef.current.offsetY - r.top;
      const pctX = Math.max(2, Math.min(98, (cx / r.width) * 100));
      const pctY = Math.max(2, Math.min(98, (cy / r.height) * 100));
      updateNode(project.id, dragRef.current.id, { pctX, pctY } as Partial<MindNode>);
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    void rect;
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
    navigate({ to: "/projects/$id/present", params: { id: project.id } });
  }

  const editingCard = editingId ? cards.find((c) => c.id === editingId) : null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/60 px-4 py-3 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/projects"><ChevronLeft className="size-4" /> Voltar</Link>
        </Button>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => renameProject(project.id, titleDraft.trim() || "Matriz")}
            className="max-w-md" />
          <span className="text-xs text-muted-foreground shrink-0">Matriz de posicionamento</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => addCard()} className="gap-1.5">
          <Plus className="size-3.5" /> Card
        </Button>
        <Button size="sm" variant="outline" onClick={addImageCard} className="gap-1.5">
          <ImageIcon className="size-3.5" /> Imagem
        </Button>
        <Button variant="destructive" size="sm" onClick={() => setRecordOpen(true)} className="gap-1.5">
          <Circle className="size-3 fill-current" /> Gravar
        </Button>
        <Button variant="outline" size="sm" onClick={handlePresent} className="gap-1.5">
          <Play className="size-4" /> Apresentar
        </Button>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground">Eixo X — esquerda</label>
              <Input value={axis.xLow} onChange={(e) => setAxis({ xLow: e.target.value })} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Eixo X — direita</label>
              <Input value={axis.xHigh} onChange={(e) => setAxis({ xHigh: e.target.value })} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Eixo Y — topo</label>
              <Input value={axis.yHigh} onChange={(e) => setAxis({ yHigh: e.target.value })} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Eixo Y — base</label>
              <Input value={axis.yLow} onChange={(e) => setAxis({ yLow: e.target.value })} className="h-8 text-sm" />
            </div>
          </div>

          <div className="relative">
            <div className="text-center text-xs font-semibold text-muted-foreground mb-1">↑ {axis.yHigh}</div>
            <div className="flex items-stretch gap-2">
              <div className="flex items-center writing-vertical text-xs font-semibold text-muted-foreground" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                {axis.xLow}
              </div>
              <div
                ref={planeRef}
                className="relative flex-1 rounded-lg border-2 border-border/70 bg-gradient-to-br from-muted/40 via-background to-muted/40 overflow-hidden"
                style={{ aspectRatio: "1 / 1", minHeight: 480 }}
              >
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border/60" />
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border/60" />
                </div>
                {cards.map((c) => (
                  <div
                    key={c.id}
                    onMouseDown={(e) => onCardMouseDown(e, c)}
                    className="absolute cursor-grab active:cursor-grabbing"
                    style={{
                      left: `${c.pctX ?? 50}%`,
                      top: `${c.pctY ?? 50}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <MatrixCard node={c} onDelete={() => deleteNode(project.id, c.id)} onEdit={() => setEditingId(c.id)} />
                  </div>
                ))}
                {cards.length === 0 && (
                  <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground pointer-events-none">
                    Adicione cards e arraste-os pela matriz.
                  </div>
                )}
              </div>
              <div className="flex items-center writing-vertical text-xs font-semibold text-muted-foreground" style={{ writingMode: "vertical-rl" }}>
                {axis.xHigh}
              </div>
            </div>
            <div className="text-center text-xs font-semibold text-muted-foreground mt-1">↓ {axis.yLow}</div>
          </div>
        </div>
      </main>

      {editingCard && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setEditingId(null)}>
          <div className="bg-card border border-border/60 rounded-xl max-w-md w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Editar card</div>
              <button onClick={() => setEditingId(null)} className="size-8 grid place-items-center rounded-full hover:bg-muted"><X className="size-4" /></button>
            </div>
            <Input value={editingCard.text} onChange={(e) => updateNode(project.id, editingCard.id, { text: e.target.value })}
              placeholder="Título do card" />
            <div>
              <label className="text-xs text-muted-foreground">Descrição (opcional)</label>
              <textarea
                value={editingCard.body ?? ""}
                onChange={(e) => updateNode(project.id, editingCard.id, { body: e.target.value } as Partial<MindNode>)}
                rows={4}
                className="mt-1 w-full text-sm rounded-md border border-border/60 bg-background p-2"
                placeholder="Informações opcionais…"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setEditingId(null)}>Concluir</Button>
            </div>
          </div>
        </div>
      )}

      <RecordFormatMenu open={recordOpen} onClose={() => setRecordOpen(false)} onPick={onPickFormat} />
    </div>
  );
}
