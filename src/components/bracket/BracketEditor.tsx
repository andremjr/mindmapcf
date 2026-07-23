import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft, Plus, Trash2, Image as ImageIcon, Play, Circle, RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import type { MindNode, Project } from "@/lib/types";
import { pickMediaAndStore, resolveImage } from "@/lib/imageStorage";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { RecordFormatMenu } from "@/components/RecordFormatMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { launchRecording } from "@/lib/launchRecording";
import type { RecordFormat } from "@/lib/recordFormats";
import { BracketBoard, clearDownstreamWinners, type WinnersMap } from "./BracketBoard";
import { PanZoom } from "@/components/ui/PanZoom";
import { NodeColorPicker } from "@/components/shared/NodeColorPicker";



function Thumb({ node }: { node: MindNode }) {
  const [url, setUrl] = useState<string | null>(node.image ?? null);
  const key = node.imageRef?.id ?? node.image ?? "";
  useEffect(() => {
    if (node.image) { setUrl(node.image); return; }
    if (!node.imageRef) { setUrl(null); return; }
    let alive = true;
    resolveImage(node.imageRef).then((u) => alive && setUrl(u));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!url) return <div className="size-full grid place-items-center text-xs text-muted-foreground">Sem imagem</div>;
  return <img src={url} alt="" className="size-full object-cover" />;
}

export function BracketEditor({ project }: { project: Project }) {
  const addNode = useStore((s) => s.addNode);
  const updateNode = useStore((s) => s.updateNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const renameProject = useStore((s) => s.renameProject);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPro } = useSubscription(user?.id);

  const root = project.nodes.find((n) => n.role === "bracket" || !n.parentId);
  const competitors = useMemo(
    () => project.nodes
      .filter((n) => n.role === "item" && n.parentId === root?.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [project.nodes, root?.id],
  );

  const [titleDraft, setTitleDraft] = useState(project.title);
  const [recordOpen, setRecordOpen] = useState(false);

  function addCompetitor() {
    if (!root) return;
    const id = addNode(project.id, { parentId: root.id });
    if (!id) return;
    updateNode(project.id, id, {
      text: `Competidor ${competitors.length + 1}`,
      role: "item",
      order: competitors.length,
      width: 220,
    } as Partial<MindNode>);
  }

  async function addImageCompetitor() {
    if (!root) return;
    const ref = await pickMediaAndStore("image");
    if (!ref) return;
    const id = addNode(project.id, { parentId: root.id });
    if (!id) return;
    updateNode(project.id, id, {
      text: `Competidor ${competitors.length + 1}`,
      role: "item",
      order: competitors.length,
      imageRef: ref,
      imageName: ref.name,
      width: 220,
    } as Partial<MindNode>);
  }

  const winners: WinnersMap = useMemo(() => {
    try { return root?.body ? JSON.parse(root.body) : {}; } catch { return {}; }
  }, [root?.body]);

  function pickWinner(matchKey: string, id: string) {
    if (!root) return;
    const next = clearDownstreamWinners(competitors, { ...winners, [matchKey]: id }, matchKey);
    updateNode(project.id, root.id, { body: JSON.stringify(next) } as Partial<MindNode>);
  }

  function resetWinners() {
    if (!root) return;
    if (!confirm("Limpar todas as escolhas de vencedores?")) return;
    updateNode(project.id, root.id, { body: "{}" } as Partial<MindNode>);
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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/60 px-4 py-3 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/projects"><ChevronLeft className="size-4" /> Voltar</Link>
        </Button>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => renameProject(project.id, titleDraft.trim() || "Chaveamento")}
            className="max-w-md" />
          <span className="text-xs text-muted-foreground shrink-0">Chaveamento</span>
        </div>
        <Button variant="ghost" size="sm" onClick={resetWinners} className="gap-1.5" title="Limpar vencedores">
          <RotateCcw className="size-4" /> Resetar
        </Button>
        <ThemeToggle />
        <Button variant="destructive" size="sm" onClick={() => setRecordOpen(true)} className="gap-1.5">
          <Circle className="size-3 fill-current" /> Gravar
        </Button>
        <Button variant="outline" size="sm" onClick={handlePresent} className="gap-1.5">
          <Play className="size-4" /> Apresentar
        </Button>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="rounded-lg border border-border/60 bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold">Competidores ({competitors.length})</div>
                <div className="text-xs text-muted-foreground">Adicione pelo menos 2. Ideal: 4, 8, 16 ou 32 — números fora de potência de 2 recebem "BYE" automático.</div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={addCompetitor} className="gap-1.5">
                  <Plus className="size-3.5" /> Texto
                </Button>
                <Button size="sm" variant="outline" onClick={addImageCompetitor} className="gap-1.5">
                  <ImageIcon className="size-3.5" /> Imagem
                </Button>
              </div>
            </div>
            {competitors.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">Nenhum competidor. Adicione o primeiro acima.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {competitors.map((c, i) => (
                  <div key={c.id} className="rounded-lg border border-border/60 bg-background overflow-hidden group relative">
                    <div className="aspect-video bg-muted"><Thumb node={c} /></div>
                    <div className="p-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">#{i + 1}</span>
                      <Input value={c.text} onChange={(e) => updateNode(project.id, c.id, { text: e.target.value })}
                        className="h-8 text-sm" />
                    </div>
                    <button onClick={() => deleteNode(project.id, c.id)}
                      className="absolute top-1 right-1 size-6 rounded-full bg-black/60 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition"
                      aria-label="Remover">
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {competitors.length >= 2 && (
            <div className="rounded-lg border border-border/60 bg-neutral-950 text-white p-4">
              <div className="mb-3">
                <div className="text-sm font-semibold">Definir vencedores</div>
                <div className="text-xs text-white/60">Arraste para navegar · scroll para zoom · clique no vencedor de cada confronto.</div>
              </div>
              <PanZoom className="h-[75vh] min-h-[480px] rounded-md bg-gradient-to-br from-neutral-950 via-slate-900 to-neutral-950" initialScale={0.85}>
                <div className="p-6" style={{ width: "max-content" }}>
                  <BracketBoard
                    competitors={competitors}
                    winners={winners}
                    currentStep={null}
                    mode="edit"
                    onPickWinner={pickWinner}
                  />
                </div>
              </PanZoom>
            </div>
          )}

        </div>

      </main>

      <RecordFormatMenu open={recordOpen} onClose={() => setRecordOpen(false)} onPick={onPickFormat} />
    </div>
  );
}
