import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft, Plus, Trash2, Image as ImageIcon, Play, Circle, GripVertical,
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
  // Sorted by CALL order (reveal order in presentation).
  const items = useMemo(
    () => project.nodes
      .filter((n) => n.role === "item" && n.parentId === root?.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [project.nodes, root?.id],
  );

  const [titleDraft, setTitleDraft] = useState(project.title);
  const [recordOpen, setRecordOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  function nextRank(): number {
    const used = new Set(items.map((n) => n.rank).filter((r): r is number => typeof r === "number"));
    for (let i = 1; i <= items.length + 1; i++) if (!used.has(i)) return i;
    return items.length + 1;
  }

  function addItem() {
    if (!root) return;
    const id = addNode(project.id, { parentId: root.id });
    if (!id) return;
    updateNode(project.id, id, {
      text: `Item ${items.length + 1}`,
      role: "item",
      order: items.length,
      rank: nextRank(),
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
      rank: nextRank(),
      imageRef: ref,
      imageName: ref.name,
      width: 300,
    } as Partial<MindNode>);
  }

  function reindexCallOrder(newList: MindNode[]) {
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
    reindexCallOrder(next);
  }

  function setRank(id: string, raw: string) {
    const parsed = parseInt(raw, 10);
    const clamped = Number.isFinite(parsed) ? Math.max(1, Math.min(items.length, parsed)) : undefined;
    updateNode(project.id, id, { rank: clamped } as Partial<MindNode>);
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

  // Warnings: duplicate ranks or missing ranks.
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
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Como funciona</p>
            <p><strong>Ordem de chamada</strong> (arraste os itens): a sequência em que aparecem na apresentação.</p>
            <p><strong>Posição no ranking</strong> (número à direita): onde cada item termina no ranking final.</p>
            <p>Assim, o público vê os itens aparecerem e serem posicionados — e um item novo pode passar outro no topo.</p>
            {(rankIssues.dupes.size > 0 || rankIssues.missing > 0) && (
              <p className="mt-2 text-amber-600 dark:text-amber-400">
                {rankIssues.missing > 0 && `${rankIssues.missing} item(s) sem posição definida. `}
                {rankIssues.dupes.size > 0 && `Posições duplicadas: ${[...rankIssues.dupes].sort((a, b) => a - b).join(", ")}.`}
              </p>
            )}
          </div>

          {items.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12">
              Adicione itens acima. Arraste para reordenar a chamada; defina a posição final em cada card.
            </div>
          )}

          <div className="space-y-3">
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
                className={`rounded-lg border border-border/60 bg-card p-3 shadow-sm space-y-2 ${
                  dragId === it.id ? "opacity-50" : ""
                } ${rankIssues.dupes.has(it.rank ?? -1) ? "ring-1 ring-amber-400/60" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="size-4 text-muted-foreground shrink-0 cursor-grab" />
                  <div className="flex flex-col items-center w-14 shrink-0">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Chamada</span>
                    <span className="text-xl font-bold tabular-nums">{i + 1}º</span>
                  </div>
                  <div className="size-12 rounded bg-muted overflow-hidden shrink-0"><Thumb node={it} /></div>
                  <Input value={it.text} onChange={(e) => updateNode(project.id, it.id, { text: e.target.value })}
                    placeholder="Título do item"
                    className="h-9 text-sm flex-1" />
                  <div className="flex flex-col items-center shrink-0">
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Ranking</label>
                    <Input
                      type="number"
                      min={1}
                      max={items.length}
                      value={it.rank ?? ""}
                      onChange={(e) => setRank(it.id, e.target.value)}
                      className="h-9 w-16 text-center tabular-nums font-semibold"
                    />
                  </div>
                  <button onClick={() => deleteNode(project.id, it.id)}
                    className="size-8 grid place-items-center rounded hover:bg-destructive/10 text-destructive shrink-0">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <Textarea
                  value={it.body ?? ""}
                  onChange={(e) => updateNode(project.id, it.id, { body: e.target.value } as Partial<MindNode>)}
                  placeholder="Descrição (opcional) — aparece no card expandido durante a chamada"
                  className="text-sm min-h-[60px] resize-none"
                />
              </div>
            ))}
          </div>
        </div>
      </main>

      <RecordFormatMenu open={recordOpen} onClose={() => setRecordOpen(false)} onPick={onPickFormat} />
    </div>
  );
}
