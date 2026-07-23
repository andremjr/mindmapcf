import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft, Plus, Trash2, Image as ImageIcon, Play, Circle, GripVertical, ArrowUp, ArrowDown,
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
  if (!url) return <div className="size-full grid place-items-center text-[10px] text-muted-foreground">—</div>;
  return <img src={url} alt="" className="size-full object-cover" />;
}

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

  const [titleDraft, setTitleDraft] = useState(project.title);
  const [recordOpen, setRecordOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  function addItem() {
    if (!root) return;
    const id = addNode(project.id, { parentId: root.id });
    if (!id) return;
    updateNode(project.id, id, {
      text: `Item ${items.length + 1}`,
      role: "item",
      order: items.length,
      width: 300,
    } as Partial<MindNode>);
  }

  async function addImageItem() {
    if (!root) return;
    const ref = await pickMediaAndStore("image");
    if (!ref) return;
    const id = addNode(project.id, { parentId: root.id });
    if (!id) return;
    updateNode(project.id, id, {
      text: ref.name.replace(/\.[^.]+$/, "").slice(0, 40),
      role: "item",
      order: items.length,
      imageRef: ref,
      imageName: ref.name,
      width: 300,
    } as Partial<MindNode>);
  }

  function reindex(newList: MindNode[]) {
    newList.forEach((n, i) => {
      if ((n.order ?? -1) !== i) updateNode(project.id, n.id, { order: i } as Partial<MindNode>);
    });
  }

  function moveTo(id: string, targetIdx: number) {
    const src = items.findIndex((n) => n.id === id);
    if (src === -1 || src === targetIdx) return;
    const next = [...items];
    const [n] = next.splice(src, 1);
    next.splice(targetIdx, 0, n);
    reindex(next);
  }

  function moveBy(id: string, delta: number) {
    const idx = items.findIndex((n) => n.id === id);
    if (idx === -1) return;
    const t = Math.max(0, Math.min(items.length - 1, idx + delta));
    moveTo(id, t);
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
        <Button size="sm" variant="outline" onClick={addImageItem} className="gap-1.5">
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
        <div className="mx-auto max-w-2xl space-y-2">
          {items.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12">
              Adicione itens acima. Arraste para reordenar; os números atualizam sozinhos.
            </div>
          )}
          {items.map((it, i) => (
            <div
              key={it.id}
              draggable
              onDragStart={() => setDragId(it.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => { if (dragId && dragId !== it.id) e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) moveTo(dragId, i);
                setDragId(null);
              }}
              className={`flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3 shadow-sm ${
                dragId === it.id ? "opacity-50" : ""
              }`}
            >
              <GripVertical className="size-4 text-muted-foreground shrink-0 cursor-grab" />
              <div className="text-2xl font-black tabular-nums w-10 text-center text-primary">{i + 1}</div>
              <div className="size-12 rounded bg-muted overflow-hidden shrink-0"><Thumb node={it} /></div>
              <Input value={it.text} onChange={(e) => updateNode(project.id, it.id, { text: e.target.value })}
                className="h-9 text-sm flex-1" />
              <button onClick={() => moveBy(it.id, -1)} disabled={i === 0}
                className="size-8 grid place-items-center rounded hover:bg-muted disabled:opacity-30">
                <ArrowUp className="size-4" />
              </button>
              <button onClick={() => moveBy(it.id, 1)} disabled={i === items.length - 1}
                className="size-8 grid place-items-center rounded hover:bg-muted disabled:opacity-30">
                <ArrowDown className="size-4" />
              </button>
              <button onClick={() => deleteNode(project.id, it.id)}
                className="size-8 grid place-items-center rounded hover:bg-destructive/10 text-destructive">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </main>

      <RecordFormatMenu open={recordOpen} onClose={() => setRecordOpen(false)} onPick={onPickFormat} />
    </div>
  );
}
