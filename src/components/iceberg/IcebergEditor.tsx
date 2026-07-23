import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Plus, Trash2, Image as ImageIcon, X, Play, Circle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import type { MindNode, Project } from "@/lib/types";
import { pickMediaAndStore, resolveImage } from "@/lib/imageStorage";
import { IcebergBackground } from "./IcebergBackground";
import { RecordFormatMenu } from "@/components/RecordFormatMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { launchRecording } from "@/lib/launchRecording";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";

const LEVEL_GRADIENTS = [
  { from: "#7dd3fc", to: "#38bdf8", text: "#0f172a" },
  { from: "#0ea5e9", to: "#0369a1", text: "#f8fafc" },
  { from: "#0369a1", to: "#0c1e3a", text: "#f8fafc" },
  { from: "#0c1e3a", to: "#020617", text: "#f8fafc" },
  { from: "#020617", to: "#000000", text: "#f8fafc" },
];

function useResolvedImage(node: MindNode | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const key = node?.imageRef?.id ?? node?.image ?? "";
  useEffect(() => {
    if (!node) { setUrl(null); return; }
    if (node.image) { setUrl(node.image); return; }
    if (!node.imageRef) { setUrl(null); return; }
    let alive = true;
    resolveImage(node.imageRef).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

function ItemTile({ node, onClick }: { node: MindNode; onClick: () => void }) {
  const url = useResolvedImage(node);
  return (
    <button
      onClick={onClick}
      className="group relative rounded-md border border-white/40 overflow-hidden shrink-0 hover:border-white transition"
      style={{ width: 84, height: 84, background: "rgba(0,0,0,0.45)" }}
    >
      {url ? (
        <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-[11px] text-center px-1 leading-tight text-white">
          {node.text || "Item"}
        </div>
      )}
      {url && node.text && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[9px] px-1 py-0.5 truncate">
          {node.text}
        </div>
      )}
    </button>
  );
}

function ExpandedCard({
  node,
  projectId,
  onClose,
  onDelete,
}: {
  node: MindNode;
  projectId: string;
  onClose: () => void;
  onDelete: () => void;
}) {
  const updateNode = useStore((s) => s.updateNode);
  const url = useResolvedImage(node);

  async function pickImage() {
    const ref = await pickMediaAndStore("image");
    if (!ref) return;
    updateNode(projectId, node.id, { imageRef: ref, imageName: ref.name });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm grid place-items-center p-4">
      <div className="bg-card border border-border/60 rounded-xl max-w-2xl w-full max-h-[85vh] overflow-auto shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <Input
            value={node.text}
            onChange={(e) => updateNode(projectId, node.id, { text: e.target.value })}
            placeholder="Título do item"
            className="border-0 text-lg font-semibold focus-visible:ring-0"
          />
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </div>
        <div className="p-4 space-y-4">
          {url ? (
            <div className="relative rounded-lg overflow-hidden bg-muted">
              <img src={url} alt="" className="w-full max-h-[300px] object-contain" />
              <Button
                size="sm"
                variant="secondary"
                className="absolute top-2 right-2"
                onClick={() => updateNode(projectId, node.id, { imageRef: undefined, imageName: undefined })}
              >
                Remover imagem
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={pickImage} className="gap-2">
              <ImageIcon className="size-4" /> Adicionar imagem
            </Button>
          )}
          <div>
            <label className="text-xs text-muted-foreground">Conteúdo</label>
            <Textarea
              value={node.body ?? ""}
              onChange={(e) => updateNode(projectId, node.id, { body: e.target.value } as Partial<MindNode>)}
              placeholder="Escreva o conteúdo detalhado deste item…"
              rows={8}
              className="mt-1"
            />
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={onDelete} className="text-destructive gap-2">
              <Trash2 className="size-4" /> Excluir item
            </Button>
            <Button onClick={onClose}>Concluir</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function IcebergEditor({ project }: { project: Project }) {
  const addNode = useStore((s) => s.addNode);
  const updateNode = useStore((s) => s.updateNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const renameProject = useStore((s) => s.renameProject);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPro } = useSubscription(user?.id);

  const root = project.nodes.find((n) => n.role === "iceberg" || !n.parentId);
  const levels = useMemo(
    () =>
      project.nodes
        .filter((n) => n.role === "level" && n.parentId === root?.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [project.nodes, root?.id],
  );

  const itemsByLevel = useMemo(() => {
    const m = new Map<string, MindNode[]>();
    for (const l of levels) m.set(l.id, []);
    for (const n of project.nodes) {
      if (n.role !== "item") continue;
      if (n.parentId && m.has(n.parentId)) m.get(n.parentId)!.push(n);
    }
    return m;
  }, [project.nodes, levels]);

  const [titleDraft, setTitleDraft] = useState(project.title);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expanded = expandedId ? project.nodes.find((n) => n.id === expandedId) ?? null : null;
  const [recordOpen, setRecordOpen] = useState(false);

  function addLevel() {
    if (!root) return;
    const id = addNode(project.id, { parentId: root.id });
    if (!id) return;
    updateNode(project.id, id, {
      text: `Nível ${levels.length + 1}`,
      role: "level",
      order: levels.length,
      width: 400,
    } as Partial<MindNode>);
  }

  function stripNumberPrefix(t: string) {
    return (t || "").replace(/^\s*\d+\.\s*/, "").trim();
  }
  function renumberLevel(levelId: string) {
    const items = (itemsByLevel.get(levelId) ?? []);
    items.forEach((it, idx) => {
      const base = stripNumberPrefix(it.text) || "Item";
      const next = `${idx + 1}. ${base}`;
      if (next !== it.text) updateNode(project.id, it.id, { text: next });
    });
  }

  function addItem(levelId: string) {
    const id = addNode(project.id, { parentId: levelId });
    if (!id) return;
    const currentCount = (itemsByLevel.get(levelId) ?? []).length;
    updateNode(project.id, id, {
      text: `${currentCount + 1}. Item`,
      role: "item",
      width: 240,
    } as Partial<MindNode>);
    setExpandedId(id);
    setTimeout(() => renumberLevel(levelId), 0);
  }

  function handleDeleteItem(item: MindNode) {
    const levelId = item.parentId;
    deleteNode(project.id, item.id);
    setExpandedId(null);
    if (levelId) setTimeout(() => renumberLevel(levelId), 0);
  }

  function handlePresent() {
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    navigate({ to: "/projects/$id/present", params: { id: project.id } });
  }

  async function onPickFormat(fmt: any) {
    setRecordOpen(false);
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
            onBlur={() => renameProject(project.id, titleDraft.trim() || "Iceberg")}
            className="max-w-md"
          />
          <span className="text-xs text-muted-foreground shrink-0">Iceberg</span>
        </div>
        <ThemeToggle />
        <Button variant="destructive" size="sm" onClick={() => setRecordOpen(true)} className="gap-1.5">
          <Circle className="size-3 fill-current" /> Gravar
        </Button>
        <Button variant="outline" size="sm" onClick={handlePresent} className="gap-1.5">
          <Play className="size-4" /> Apresentar
        </Button>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl flex flex-col relative">
          <div className="absolute inset-0 pointer-events-none">
            <IcebergBackground levels={Math.max(1, levels.length)} />
          </div>
          {levels.map((lvl, i) => {
            const grad = LEVEL_GRADIENTS[Math.min(i, LEVEL_GRADIENTS.length - 1)];
            const items = itemsByLevel.get(lvl.id) ?? [];
            const minH = i === 0 ? 200 : 260;
            return (
              <div
                key={lvl.id}
                className="relative px-8 py-8 flex flex-col gap-3"
                style={{
                  background: `linear-gradient(180deg, ${grad.from} 0%, ${grad.to} 100%)`,
                  color: grad.text,
                  minHeight: minH,
                }}
              >
                <div className="flex items-center justify-between relative z-10">
                  <input
                    value={lvl.text}
                    onChange={(e) => updateNode(project.id, lvl.id, { text: e.target.value })}
                    className="bg-transparent font-bold text-2xl outline-none border-b border-transparent focus:border-current/40"
                    style={{ color: grad.text }}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="bg-white/20 hover:bg-white/30 text-white border-white/20"
                      onClick={() => addItem(lvl.id)}
                    >
                      <Plus className="size-3.5" /> Item
                    </Button>
                    <button
                      onClick={() => deleteNode(project.id, lvl.id)}
                      className="text-xs opacity-70 hover:opacity-100 flex items-center gap-1"
                    >
                      <Trash2 className="size-3" /> Remover
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 relative z-10">
                  {items.map((it) => (
                    <ItemTile key={it.id} node={it} onClick={() => setExpandedId(it.id)} />
                  ))}
                  {items.length === 0 && (
                    <div className="text-sm opacity-70 italic">Adicione itens neste nível…</div>
                  )}
                </div>
              </div>
            );
          })}

          <div className="px-8 py-6 bg-black/40 border-t border-border/60 relative z-10">
            <Button variant="outline" onClick={addLevel} className="gap-2">
              <Plus className="size-4" /> Adicionar nível
            </Button>
          </div>
        </div>
      </main>

      {expanded && (
        <ExpandedCard
          node={expanded}
          projectId={project.id}
          onClose={() => setExpandedId(null)}
          onDelete={() => handleDeleteItem(expanded)}
        />
      )}

      <RecordFormatMenu open={recordOpen} onClose={() => setRecordOpen(false)} onPick={onPickFormat} />
    </div>
  );
}
