import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft, Plus, Trash2, Image as ImageIcon, Play, Circle, RotateCcw, X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import type { MindNode, Project } from "@/lib/types";
import { pickMediaAndStore, pickMediaMultipleAndStore, resolveImage } from "@/lib/imageStorage";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { RecordFormatMenu } from "@/components/RecordFormatMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NarrationDock } from "@/components/shared/NarrationDock";
import { launchRecording } from "@/lib/launchRecording";
import type { RecordFormat } from "@/lib/recordFormats";
import { BracketBoard, clearDownstreamWinners, type WinnersMap } from "./BracketBoard";
import { PanZoom } from "@/components/ui/PanZoom";
import { NodeColorPicker } from "@/components/shared/NodeColorPicker";
import { parseBracketConfig, serializeBracketConfig } from "@/lib/bracketConfig";
import { ASPECT_OPTIONS, aspectDims, type ItemAspect } from "@/lib/tierlistConfig";


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

function CompetitorThumb({
  node,
  aspect,
  onPickImage,
  onClearImage,
}: {
  node: MindNode;
  aspect: ItemAspect;
  onPickImage: () => void;
  onClearImage: () => void;
}) {
  const url = useResolvedImage(node);
  const { w, h } = aspectDims(140, aspect);
  return (
    <div
      className="relative bg-muted rounded-md overflow-hidden mx-auto group/img"
      style={{ width: w, height: h }}
    >
      {url ? (
        <>
          <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 opacity-0 group-hover/img:opacity-100 transition bg-black/50 grid place-items-center gap-2">
            <button
              onClick={onPickImage}
              className="text-[11px] px-2 py-1 rounded bg-white/90 text-black font-medium hover:bg-white"
            >Trocar</button>
            <button
              onClick={onClearImage}
              className="text-[11px] px-2 py-1 rounded bg-black/70 text-white font-medium hover:bg-black/90"
            >Remover</button>
          </div>
        </>
      ) : (
        <button
          onClick={onPickImage}
          className="absolute inset-0 grid place-items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 transition"
        >
          <ImageIcon className="size-5" />
          Adicionar imagem
        </button>
      )}
    </div>
  );
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

  const cfg = useMemo(() => parseBracketConfig(root?.body), [root?.body]);
  const winners: WinnersMap = cfg.winners;
  const itemAspect: ItemAspect = cfg.itemAspect;
  const accentColor: string = cfg.accentColor;

  function persistConfig(next: Partial<typeof cfg>) {
    if (!root) return;
    updateNode(project.id, root.id, {
      body: serializeBracketConfig({ ...cfg, ...next }),
    } as Partial<MindNode>);
  }
  function setItemAspect(a: ItemAspect) { persistConfig({ itemAspect: a }); }
  function setAccentColor(c: string | undefined) { persistConfig({ accentColor: c || "#fbbf24" }); }


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

  /**
   * Bulk-create one competitor per selected image file — same pattern as the
   * tier list, aimed at authors who already have a folder of contender images
   * (movie posters, logos, thumbnails) ready to go.
   */
  async function addCompetitorsFromImages() {
    if (!root) return;
    const refs = await pickMediaMultipleAndStore("image");
    if (refs.length === 0) return;
    let next = competitors.length;
    for (const ref of refs) {
      const id = addNode(project.id, { parentId: root.id });
      if (!id) continue;
      const baseName = ref.name.replace(/\.[^.]+$/, "");
      updateNode(project.id, id, {
        text: baseName || `Competidor ${next + 1}`,
        role: "item",
        order: next,
        width: 220,
        imageRef: ref,
        imageName: ref.name,
      } as Partial<MindNode>);
      next += 1;
    }
  }

  async function pickImageFor(nodeId: string) {
    const ref = await pickMediaAndStore("image");
    if (!ref) return;
    updateNode(project.id, nodeId, {
      imageRef: ref,
      imageName: ref.name,
    } as Partial<MindNode>);
  }
  function clearImageFor(nodeId: string) {
    updateNode(project.id, nodeId, {
      imageRef: undefined,
      image: undefined,
      imageName: undefined,
    } as Partial<MindNode>);
  }

  function pickWinner(matchKey: string, id: string) {
    if (!root) return;
    const next = clearDownstreamWinners(competitors, { ...winners, [matchKey]: id }, matchKey);
    persistConfig({ winners: next });
  }

  function resetWinners() {
    if (!root) return;
    if (!confirm("Limpar todas as escolhas de vencedores?")) return;
    persistConfig({ winners: {} });
  }


  /**
   * All-or-none rule for winners: either every match is decided (champion
   * emerges → animated reveal) OR no winner is picked (manual mode → user
   * clicks winners live on stage). Anything in between produces a broken
   * script.
   */
  function validatePlacement(): boolean {
    if (competitors.length < 2) {
      alert("Adicione pelo menos 2 competidores.");
      return false;
    }
    const anyPicked = Object.keys(winners).length > 0;
    const decided = !!winners["FINAL"];
    if (!anyPicked || decided) return true;
    alert(
      "O chaveamento está parcialmente preenchido. Decida todos os confrontos até o campeão " +
      "ou limpe todos os vencedores (para escolher ao vivo na apresentação/gravação)."
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
        <NarrationDock projectId={project.id} narrationRef={project.narrationRef} />
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
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold">Competidores ({competitors.length})</div>
                <div className="text-xs text-muted-foreground">Adicione pelo menos 2. Ideal: 4, 8, 16 ou 32 — números fora de potência de 2 recebem "BYE" automático.</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
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
                <div className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1" title="Cor de destaque usada no confronto atual, no rótulo Final e no card do campeão">
                  <span className="text-[11px] text-muted-foreground">Destaque</span>
                  <NodeColorPicker
                    value={accentColor}
                    onChange={setAccentColor}
                    label=""
                    size={16}
                  />
                </div>
                <Button size="sm" variant="outline" onClick={addCompetitor} className="gap-1.5">
                  <Plus className="size-3.5" /> Adicionar competidor
                </Button>
                <Button size="sm" variant="outline" onClick={addCompetitorsFromImages} className="gap-1.5" title="Selecione várias imagens de uma pasta para criar um competidor por imagem">
                  <ImageIcon className="size-3.5" /> Importar imagens
                </Button>
              </div>

            </div>
            {competitors.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">Nenhum competidor. Adicione o primeiro acima.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {competitors.map((c, i) => (
                  <div key={c.id} className="rounded-lg border-2 bg-background overflow-hidden group relative"
                    style={{ borderColor: c.color ?? "hsl(var(--border) / 0.6)" }}>
                    <div className="pt-3 px-3">
                      <CompetitorThumb
                        node={c}
                        aspect={itemAspect}
                        onPickImage={() => pickImageFor(c.id)}
                        onClearImage={() => clearImageFor(c.id)}
                      />
                    </div>
                    <div className="p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">#{i + 1}</span>
                        <Input value={c.text} onChange={(e) => updateNode(project.id, c.id, { text: e.target.value })}
                          className="h-8 text-sm" placeholder="Nome do competidor" />
                      </div>
                      <NodeColorPicker
                        value={c.color}
                        onChange={(col) => updateNode(project.id, c.id, { color: col } as Partial<MindNode>)}
                        label=""
                        size={16}
                      />
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
