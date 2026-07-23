import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft, Plus, Trash2, Play, Circle, X, Image as ImageIcon, Video as VideoIcon,
  Grid2x2, ScatterChart, Minus, Target,
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

export type ChartType = "quadrants" | "scatter" | "line" | "bullseye";
export interface AxisConfig {
  chartType: ChartType;
  xLow: string; xHigh: string; yLow: string; yHigh: string;
  xLabel: string; yLabel: string;
  lineLabel: string;
  bullseyeLabel: string;
}

const DEFAULT_AXIS: AxisConfig = {
  chartType: "quadrants",
  xLow: "Baixo custo", xHigh: "Alto custo",
  yLow: "Baixo potencial", yHigh: "Alto potencial",
  xLabel: "Eixo X", yLabel: "Eixo Y",
  lineLabel: "Linha do tempo",
  bullseyeLabel: "Prioridade (centro = topo)",
};

export function parseAxis(body: string | undefined): AxisConfig {
  try {
    const p = body ? JSON.parse(body) : {};
    return { ...DEFAULT_AXIS, ...p };
  } catch { return DEFAULT_AXIS; }
}

const CHART_TYPES: { id: ChartType; label: string; hint: string; Icon: any }[] = [
  { id: "quadrants", label: "Quadrantes", hint: "2 eixos, 4 zonas", Icon: Grid2x2 },
  { id: "scatter",   label: "Dispersão",  hint: "2 eixos numéricos", Icon: ScatterChart },
  { id: "line",      label: "Linha",      hint: "1 eixo horizontal", Icon: Minus },
  { id: "bullseye",  label: "Alvo",       hint: "prioridade radial", Icon: Target },
];

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
  node, onDelete, onEdit, compact,
}: { node: MindNode; onDelete: () => void; onEdit: () => void; compact?: boolean }) {
  const url = useResolvedImage(node);
  const width = compact ? 96 : 132;
  return (
    <div className="relative rounded-lg bg-card border border-border/70 shadow-md overflow-hidden hover:border-primary/60 transition group" style={{ width }}>
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
  const chart = axis.chartType;

  const [titleDraft, setTitleDraft] = useState(project.title);
  const [recordOpen, setRecordOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const planeRef = useRef<HTMLDivElement>(null);

  function setAxis(patch: Partial<AxisConfig>) {
    if (!root) return;
    updateNode(project.id, root.id, { body: JSON.stringify({ ...axis, ...patch }) } as Partial<MindNode>);
  }

  function addCard() {
    if (!root) return;
    const id = addNode(project.id, { parentId: root.id });
    if (!id) return;
    const initial: Partial<MindNode> = {
      text: "Novo card",
      role: "item",
      pctX: 50,
      pctY: chart === "line" ? 50 : 50,
      width: 132,
    };
    updateNode(project.id, id, initial);
  }

  // Drag
  const dragRef = useRef<{ id: string } | null>(null);
  function onCardMouseDown(e: React.MouseEvent, node: MindNode) {
    if (!planeRef.current) return;
    dragRef.current = { id: node.id };
    const move = (ev: MouseEvent) => {
      if (!dragRef.current || !planeRef.current) return;
      const r = planeRef.current.getBoundingClientRect();
      const cx = ev.clientX - r.left;
      const cy = ev.clientY - r.top;
      const pctX = Math.max(2, Math.min(98, (cx / r.width) * 100));
      const pctY = chart === "line"
        ? 50
        : Math.max(2, Math.min(98, (cy / r.height) * 100));
      updateNode(project.id, dragRef.current.id, { pctX, pctY } as Partial<MindNode>);
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    void e;
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
  const editingUrl = useResolvedImage(editingCard ?? undefined);

  async function attachMedia(kind: "image" | "video") {
    if (!editingCard) return;
    const ref = await pickMediaAndStore(kind);
    if (!ref) return;
    updateNode(project.id, editingCard.id, { imageRef: ref, imageName: ref.name } as Partial<MindNode>);
  }
  function clearMedia() {
    if (!editingCard) return;
    updateNode(project.id, editingCard.id, { imageRef: undefined, image: undefined, imageName: undefined } as Partial<MindNode>);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/60 px-4 py-3 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/projects"><ChevronLeft className="size-4" /> Voltar</Link>
        </Button>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => renameProject(project.id, titleDraft.trim() || "Gráfico")}
            className="max-w-md" />
          <span className="text-xs text-muted-foreground shrink-0">Gráficos</span>
        </div>
        <Button size="sm" variant="outline" onClick={addCard} className="gap-1.5">
          <Plus className="size-3.5" /> Card
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
        <div className="mx-auto max-w-5xl space-y-4">
          {/* Chart type picker */}
          <div className="flex flex-wrap gap-2">
            {CHART_TYPES.map(({ id, label, hint, Icon }) => {
              const active = chart === id;
              return (
                <button
                  key={id}
                  onClick={() => setAxis({ chartType: id })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition ${
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/60 bg-card hover:border-primary/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                  <div className="leading-tight">
                    <div className="text-xs font-semibold">{label}</div>
                    <div className="text-[10px] opacity-70">{hint}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Axis config */}
          {chart === "quadrants" && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <AxisInput label="Eixo X — esquerda" value={axis.xLow} onChange={(v) => setAxis({ xLow: v })} />
              <AxisInput label="Eixo X — direita"  value={axis.xHigh} onChange={(v) => setAxis({ xHigh: v })} />
              <AxisInput label="Eixo Y — topo"     value={axis.yHigh} onChange={(v) => setAxis({ yHigh: v })} />
              <AxisInput label="Eixo Y — base"     value={axis.yLow} onChange={(v) => setAxis({ yLow: v })} />
            </div>
          )}
          {chart === "scatter" && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <AxisInput label="Eixo X (nome)" value={axis.xLabel} onChange={(v) => setAxis({ xLabel: v })} />
              <AxisInput label="Eixo Y (nome)" value={axis.yLabel} onChange={(v) => setAxis({ yLabel: v })} />
              <AxisInput label="X mínimo → máximo" value={`${axis.xLow} → ${axis.xHigh}`} onChange={() => {}} readOnly />
              <AxisInput label="Y mínimo → máximo" value={`${axis.yLow} → ${axis.yHigh}`} onChange={() => {}} readOnly />
            </div>
          )}
          {chart === "line" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <AxisInput label="Título do eixo" value={axis.lineLabel} onChange={(v) => setAxis({ lineLabel: v })} />
              <AxisInput label="Início"  value={axis.xLow}  onChange={(v) => setAxis({ xLow: v })} />
              <AxisInput label="Fim"     value={axis.xHigh} onChange={(v) => setAxis({ xHigh: v })} />
            </div>
          )}
          {chart === "bullseye" && (
            <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
              <AxisInput label="Legenda" value={axis.bullseyeLabel} onChange={(v) => setAxis({ bullseyeLabel: v })} />
            </div>
          )}

          {/* Plane */}
          <ChartPlane
            chart={chart}
            axis={axis}
            planeRef={planeRef}
            cards={cards}
            onCardMouseDown={onCardMouseDown}
            onDelete={(id) => deleteNode(project.id, id)}
            onEdit={(id) => setEditingId(id)}
          />
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

            <div>
              <label className="text-xs text-muted-foreground">Mídia (opcional)</label>
              {editingUrl ? (
                <div className="mt-1 flex items-center gap-2">
                  <img src={editingUrl} alt="" className="size-16 rounded-md object-cover border border-border/60" />
                  <div className="flex-1 text-xs text-muted-foreground truncate">{editingCard.imageName || "Mídia anexada"}</div>
                  <Button size="sm" variant="ghost" onClick={clearMedia}>Remover</Button>
                </div>
              ) : (
                <div className="mt-1 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => attachMedia("image")} className="gap-1.5">
                    <ImageIcon className="size-3.5" /> Imagem
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => attachMedia("video")} className="gap-1.5">
                    <VideoIcon className="size-3.5" /> Vídeo
                  </Button>
                </div>
              )}
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

function AxisInput({
  label, value, onChange, readOnly,
}: { label: string; value: string; onChange: (v: string) => void; readOnly?: boolean }) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} readOnly={readOnly} className="h-8 text-sm" />
    </div>
  );
}

function ChartPlane({
  chart, axis, planeRef, cards, onCardMouseDown, onDelete, onEdit,
}: {
  chart: ChartType;
  axis: AxisConfig;
  planeRef: React.RefObject<HTMLDivElement | null>;
  cards: MindNode[];
  onCardMouseDown: (e: React.MouseEvent, node: MindNode) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const empty = cards.length === 0;
  const emptyMsg = "Clique em + Card e arraste-o pelo gráfico.";

  if (chart === "line") {
    return (
      <div className="relative">
        <div className="text-center text-xs font-semibold text-muted-foreground mb-1">{axis.lineLabel}</div>
        <div
          ref={planeRef}
          className="relative rounded-lg border-2 border-border/70 bg-gradient-to-r from-muted/40 via-background to-muted/40 overflow-hidden"
          style={{ height: 260 }}
        >
          <div className="absolute inset-y-0 left-0 right-0 flex items-center px-4 pointer-events-none">
            <div className="h-0.5 w-full bg-border" />
          </div>
          <div className="absolute top-1 left-3 text-[11px] text-muted-foreground">← {axis.xLow}</div>
          <div className="absolute top-1 right-3 text-[11px] text-muted-foreground">{axis.xHigh} →</div>
          {cards.map((c) => (
            <div
              key={c.id}
              onMouseDown={(e) => onCardMouseDown(e, c)}
              className="absolute cursor-grab active:cursor-grabbing"
              style={{ left: `${c.pctX ?? 50}%`, top: "50%", transform: "translate(-50%, -50%)" }}
            >
              <MatrixCard node={c} compact onDelete={() => onDelete(c.id)} onEdit={() => onEdit(c.id)} />
            </div>
          ))}
          {empty && <EmptyMsg text={emptyMsg} />}
        </div>
      </div>
    );
  }

  if (chart === "bullseye") {
    return (
      <div className="relative">
        <div className="text-center text-xs font-semibold text-muted-foreground mb-1">{axis.bullseyeLabel}</div>
        <div className="flex justify-center">
          <div
            ref={planeRef}
            className="relative rounded-full border-2 border-border/70 bg-background overflow-hidden"
            style={{ width: 520, height: 520, maxWidth: "100%" }}
          >
            {[0.85, 0.6, 0.35, 0.15].map((r, i) => (
              <div key={i} className="absolute rounded-full border border-border/50"
                style={{
                  left: "50%", top: "50%",
                  width: `${r * 100}%`, height: `${r * 100}%`,
                  transform: "translate(-50%, -50%)",
                  background: i % 2 === 0 ? "hsl(var(--muted) / 0.35)" : "transparent",
                }} />
            ))}
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
                <MatrixCard node={c} compact onDelete={() => onDelete(c.id)} onEdit={() => onEdit(c.id)} />
              </div>
            ))}
            {empty && <EmptyMsg text={emptyMsg} />}
          </div>
        </div>
      </div>
    );
  }

  // quadrants + scatter share the same 2D plane
  const isScatter = chart === "scatter";
  const yTop    = isScatter ? axis.yLabel : axis.yHigh;
  const yBottom = isScatter ? ""          : axis.yLow;
  const xLeft   = isScatter ? ""          : axis.xLow;
  const xRight  = isScatter ? axis.xLabel : axis.xHigh;

  return (
    <div className="relative">
      <div className="text-center text-xs font-semibold text-muted-foreground mb-1">
        {isScatter ? yTop : `↑ ${yTop}`}
      </div>
      <div className="flex items-stretch gap-2">
        <div className="flex items-center text-xs font-semibold text-muted-foreground"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
          {xLeft}
        </div>
        <div
          ref={planeRef}
          className="relative flex-1 rounded-lg border-2 border-border/70 bg-gradient-to-br from-muted/40 via-background to-muted/40 overflow-hidden"
          style={{ aspectRatio: "1 / 1", minHeight: 480 }}
        >
          {isScatter ? (
            <div className="absolute inset-0 pointer-events-none">
              {[20, 40, 60, 80].map((p) => (
                <div key={`v${p}`} className="absolute inset-y-0 w-px bg-border/40" style={{ left: `${p}%` }} />
              ))}
              {[20, 40, 60, 80].map((p) => (
                <div key={`h${p}`} className="absolute inset-x-0 h-px bg-border/40" style={{ top: `${p}%` }} />
              ))}
              <div className="absolute inset-y-0 left-0 w-px bg-border/80" />
              <div className="absolute inset-x-0 bottom-0 h-px bg-border/80" />
            </div>
          ) : (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border/60" />
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border/60" />
            </div>
          )}
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
              <MatrixCard node={c} onDelete={() => onDelete(c.id)} onEdit={() => onEdit(c.id)} />
            </div>
          ))}
          {empty && <EmptyMsg text={emptyMsg} />}
        </div>
        <div className="flex items-center text-xs font-semibold text-muted-foreground"
          style={{ writingMode: "vertical-rl" }}>
          {xRight}
        </div>
      </div>
      <div className="text-center text-xs font-semibold text-muted-foreground mt-1">
        {isScatter ? "" : `↓ ${yBottom}`}
      </div>
    </div>
  );
}

function EmptyMsg({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground pointer-events-none">
      {text}
    </div>
  );
}
