import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft, Plus, Trash2, Play, Circle, X, Image as ImageIcon, Images,
  ArrowUpDown, ArrowUp, ArrowDown, MoveVertical,
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
import {
  DEFAULT_SCALE, formatValue, heightRatio, parseItemData, parseScaleConfig,
  serializeItemData, type ScaleConfig, type SortMode,
} from "@/lib/scaleConfig";

/* ---------- image resolution ---------- */
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

/* ---------- ordering helpers ---------- */
export function orderItems(items: MindNode[], sortMode: SortMode): MindNode[] {
  const withValues = items.map((n) => ({ node: n, data: parseItemData(n.body) }));
  if (sortMode === "asc")  withValues.sort((a, b) => a.data.value - b.data.value);
  if (sortMode === "desc") withValues.sort((a, b) => b.data.value - a.data.value);
  if (sortMode === "manual") withValues.sort((a, b) => (a.node.order ?? 0) - (b.node.order ?? 0));
  return withValues.map((w) => w.node);
}

/* ---------- viral-style palette (mirrors ScalePresentation.AUTO_PALETTE) ---------- */
const AUTO_PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e",
];
export function paletteColorFor(index: number): string {
  return AUTO_PALETTE[index % AUTO_PALETTE.length];
}

/* ---------- 3D bar preview (editor thumb) ----------
 * Isometric pedestal matching the presentation style: big square photo on
 * top of the bar and integrated front-face panel (rank chip + name + value). */
function BarPreview({
  h, w = 96, color, accent, active, rank, name, value, unit, imageUrl,
}: {
  h: number; w?: number; color: string; accent: string; active?: boolean;
  rank: number; name: string; value: number; unit: string; imageUrl: string | null;
}) {
  const depth = Math.max(10, Math.min(28, w * 0.28));
  const photoSize = Math.round(w * 1.05);
  const photoLift = 6;
  return (
    <div
      className="relative shrink-0"
      style={{ width: Math.max(w + depth, photoSize) + 4, height: h + depth + photoSize + photoLift }}
    >
      {/* Photo on top of the pedestal */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-lg overflow-hidden bg-white border border-black/10 shadow-lg grid place-items-center"
        style={{ top: 0, width: photoSize, height: photoSize }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground/60" />
        )}
      </div>

      {/* Bar block below the photo */}
      <div className="absolute" style={{ left: (Math.max(w + depth, photoSize) + 4 - (w + depth)) / 2, top: photoSize + photoLift, width: w + depth, height: h + depth }}>
        {/* Top face */}
        <div
          className="absolute"
          style={{
            left: depth, top: 0, width: w, height: depth,
            transform: "skewX(-45deg)", transformOrigin: "left top",
            background: `linear-gradient(to bottom, ${mix(color, "#ffffff", 0.55)}, ${mix(color, "#ffffff", 0.25)})`,
          }}
        />
        {/* Right side face */}
        <div
          className="absolute"
          style={{
            left: depth + w, top: depth, width: depth, height: h,
            transform: "skewY(-45deg)", transformOrigin: "left top",
            background: `linear-gradient(to right, ${mix(color, "#000000", 0.25)}, ${mix(color, "#000000", 0.45)})`,
          }}
        />
        {/* Front face + integrated panel */}
        <div
          className="absolute rounded-sm overflow-hidden"
          style={{
            left: depth, top: depth, width: w, height: h,
            background: `linear-gradient(to bottom, ${mix(color, "#ffffff", 0.15)}, ${color} 60%, ${mix(color, "#000000", 0.2)})`,
            boxShadow: active ? `0 0 20px ${accent}bb, inset 0 0 0 2px ${accent}` : "inset 0 0 0 1px rgba(255,255,255,0.15)",
          }}
        >
          <div
            className="absolute inset-x-1 top-1 rounded-md bg-black/70 backdrop-blur px-1.5 py-1 flex flex-col gap-0.5 text-white"
            style={{ boxShadow: `inset 0 0 0 1px ${accent}55` }}
          >
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-bold px-1 rounded" style={{ background: accent, color: "#0a0a0a" }}>
                #{rank}
              </span>
              <span className="text-[9px] truncate opacity-90">{name}</span>
            </div>
            <div className="text-[11px] font-bold leading-tight truncate" style={{ color: accent }}>
              {formatValue(value)}{unit ? ` ${unit}` : ""}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Blend two hex colors (a → b by t in [0,1]). Falls back to `a` on bad input. */
function mix(a: string, b: string, t: number): string {
  const pa = hexToRgb(a); const pb = hexToRgb(b);
  if (!pa || !pb) return a;
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}
function hexToRgb(hex: string) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 128, g: 128, b: 128 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
export { mix };

/* ================================================================= */
export function ScaleEditor({ project }: { project: Project }) {
  const addNode = useStore((s) => s.addNode);
  const updateNode = useStore((s) => s.updateNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const renameProject = useStore((s) => s.renameProject);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPro } = useSubscription(user?.id);

  const root = project.nodes.find((n) => n.role === "scale" || !n.parentId);
  const items = useMemo(
    () => project.nodes.filter((n) => n.role === "item" && n.parentId === root?.id),
    [project.nodes, root?.id],
  );
  const config = useMemo(() => parseScaleConfig(root?.body), [root?.body]);
  const ordered = useMemo(() => orderItems(items, config.sortMode), [items, config.sortMode]);
  const values = ordered.map((n) => parseItemData(n.body).value);

  const [titleDraft, setTitleDraft] = useState(project.title);
  const [recordOpen, setRecordOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function setConfig(patch: Partial<ScaleConfig>) {
    if (!root) return;
    updateNode(project.id, root.id, { body: JSON.stringify({ ...config, ...patch }) } as Partial<MindNode>);
  }

  function addItem() {
    if (!root) return;
    const id = addNode(project.id, { parentId: root.id });
    if (!id) return;
    const nextOrder = items.length;
    updateNode(project.id, id, {
      text: `Item ${items.length + 1}`,
      role: "item",
      width: 160,
      order: nextOrder,
      body: serializeItemData({ value: 100 }),
    } as Partial<MindNode>);
    setEditingId(id);
  }

  async function addBulkImages() {
    if (!root) return;
    const refs = await pickMediaMultipleAndStore("image");
    let counter = items.length;
    for (const ref of refs) {
      const id = addNode(project.id, { parentId: root.id });
      if (!id) continue;
      const cleanName = ref.name.replace(/\.[a-z0-9]+$/i, "");
      updateNode(project.id, id, {
        text: cleanName,
        role: "item",
        width: 160,
        order: counter,
        body: serializeItemData({ value: 100 }),
        imageRef: ref,
        imageName: ref.name,
      } as Partial<MindNode>);
      counter += 1;
    }
  }

  function updateItemData(node: MindNode, patch: Partial<ReturnType<typeof parseItemData>>) {
    const cur = parseItemData(node.body);
    updateNode(project.id, node.id, { body: serializeItemData({ ...cur, ...patch }) } as Partial<MindNode>);
  }

  async function onPickFormat(fmt: RecordFormat) {
    setRecordOpen(false);
    if (items.length === 0) { alert("Adicione ao menos um item antes de gravar."); return; }
    try { await launchRecording(project, fmt, isPro); }
    catch (e: any) {
      if (e?.name !== "NotAllowedError") alert(e?.message || "Falha ao iniciar gravação.");
      return;
    }
    navigate({ to: "/projects/$id/present", params: { id: project.id }, search: { record: "1" } });
  }

  function handlePresent() {
    if (items.length === 0) { alert("Adicione ao menos um item antes de apresentar."); return; }
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    navigate({ to: "/projects/$id/present", params: { id: project.id } });
  }

  const editingItem = editingId ? items.find((c) => c.id === editingId) : null;
  const editingUrl = useResolvedImage(editingItem ?? undefined);

  async function attachImage(node: MindNode) {
    const ref = await pickMediaAndStore("image");
    if (!ref) return;
    updateNode(project.id, node.id, { imageRef: ref, imageName: ref.name } as Partial<MindNode>);
  }
  function clearImage(node: MindNode) {
    updateNode(project.id, node.id, { imageRef: undefined, image: undefined, imageName: undefined } as Partial<MindNode>);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/60 px-4 py-3 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/projects"><ChevronLeft className="size-4" /> Voltar</Link>
        </Button>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => renameProject(project.id, titleDraft.trim() || "Comparação de escala")}
            className="max-w-md" />
          <span className="text-xs text-muted-foreground shrink-0">Comparação de escala</span>
        </div>
        <Button size="sm" variant="outline" onClick={addItem} className="gap-1.5">
          <Plus className="size-3.5" /> Item
        </Button>
        <Button size="sm" variant="outline" onClick={addBulkImages} className="gap-1.5">
          <Images className="size-3.5" /> Imagens
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

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl grid grid-cols-[1fr_320px] gap-4 p-6">
          {/* Left: controls + bars strip */}
          <div className="space-y-4 min-w-0">
            {/* Toolbar row: sort mode, scale mode, unit */}
            <div className="rounded-lg border border-border/60 bg-card/40 px-3 py-3 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Ordenação</span>
                  <SortBtn active={config.sortMode === "asc"} onClick={() => setConfig({ sortMode: "asc" })} icon={<ArrowUp className="size-3.5" />} label="Menor → maior" />
                  <SortBtn active={config.sortMode === "desc"} onClick={() => setConfig({ sortMode: "desc" })} icon={<ArrowDown className="size-3.5" />} label="Maior → menor" />
                  <SortBtn active={config.sortMode === "manual"} onClick={() => setConfig({ sortMode: "manual" })} icon={<MoveVertical className="size-3.5" />} label="Manual" />
                </div>
                <div className="h-6 w-px bg-border/60" />
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Escala real proporcional — bares maiores mostram diferenças de ordem de grandeza como no mundo real.
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Unidade padrão</span>
                  <Input value={config.unit} onChange={(e) => setConfig({ unit: e.target.value })} placeholder="Ex.: m, km, R$, hab." />
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Legenda / abertura</span>
                  <Input value={config.caption} onChange={(e) => setConfig({ caption: e.target.value })} placeholder="Ex.: Uma comparação em escala." />
                </label>
                <div className="flex items-end gap-3">
                  <ColorField label="Cor das barras" value={config.barColor} onChange={(v) => setConfig({ barColor: v })} />
                  <ColorField label="Acento" value={config.accentColor} onChange={(v) => setConfig({ accentColor: v })} />
                </div>
              </div>
            </div>

            {/* Bars strip preview */}
            <div className="rounded-xl border border-border/60 bg-gradient-to-b from-muted/20 to-background p-6 overflow-hidden">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Prévia da comparação</div>
              {ordered.length === 0 ? (
                <div className="text-sm text-muted-foreground italic py-10 text-center">
                  Nenhum item ainda. Adicione itens para ver a comparação.
                </div>
              ) : (
                <div className="flex items-end justify-center gap-6 min-h-[280px]">
                  {ordered.map((n) => {
                    const data = parseItemData(n.body);
                    const ratio = heightRatio(data.value, values);
                    const h = Math.max(20, Math.round(ratio * 240));
                    return (
                      <button
                        key={n.id}
                        onClick={() => setEditingId(n.id)}
                        className="flex flex-col items-center gap-1 group focus:outline-none"
                        title="Clique para editar"
                      >
                        <div className="text-[10px] text-muted-foreground group-hover:text-foreground">
                          {formatValue(data.value)} {data.unit || config.unit}
                        </div>
                        <BarPreview h={h} color={n.color ?? config.barColor} accent={config.accentColor} active={editingId === n.id} />
                        <div className="text-[11px] font-medium max-w-[100px] truncate">{n.text}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Items list (compact rows for quick editing) */}
            <div className="rounded-lg border border-border/60 divide-y divide-border/60 overflow-hidden">
              {ordered.map((n, idx) => {
                const data = parseItemData(n.body);
                const active = editingId === n.id;
                return (
                  <div key={n.id}
                    className={`flex items-center gap-3 px-3 py-2 text-sm ${active ? "bg-primary/5" : "bg-card"}`}
                  >
                    <span className="text-xs text-muted-foreground w-6 text-right">{idx + 1}</span>
                    <Input
                      value={n.text}
                      onChange={(e) => updateNode(project.id, n.id, { text: e.target.value })}
                      className="max-w-[220px]"
                      placeholder="Nome"
                    />
                    <Input
                      type="number"
                      value={Number.isFinite(data.value) ? data.value : 0}
                      onChange={(e) => updateItemData(n, { value: Number(e.target.value) || 0 })}
                      className="max-w-[140px]"
                      placeholder="Valor"
                    />
                    <Input
                      value={data.unit ?? ""}
                      onChange={(e) => updateItemData(n, { unit: e.target.value })}
                      className="max-w-[100px]"
                      placeholder={config.unit || "Unidade"}
                    />
                    <div className="ml-auto flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(active ? null : n.id)}>Detalhes</Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteNode(project.id, n.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {ordered.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground italic">Adicione um item para começar.</div>
              )}
            </div>
          </div>

          {/* Right: inspector */}
          <aside className="sticky top-4 self-start rounded-xl border border-border/60 bg-card p-4 space-y-4">
            {editingItem ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Editar item</div>
                  <button onClick={() => setEditingId(null)} className="size-7 grid place-items-center rounded-full hover:bg-muted"><X className="size-4" /></button>
                </div>
                <label className="block space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Nome</span>
                  <Input value={editingItem.text} onChange={(e) => updateNode(project.id, editingItem.id, { text: e.target.value })} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Valor</span>
                    <Input type="number" value={parseItemData(editingItem.body).value}
                      onChange={(e) => updateItemData(editingItem, { value: Number(e.target.value) || 0 })} />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Unidade</span>
                    <Input value={parseItemData(editingItem.body).unit ?? ""}
                      placeholder={config.unit || "—"}
                      onChange={(e) => updateItemData(editingItem, { unit: e.target.value })} />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Texto complementar</span>
                  <textarea
                    value={parseItemData(editingItem.body).note ?? ""}
                    onChange={(e) => updateItemData(editingItem, { note: e.target.value })}
                    rows={4}
                    className="w-full text-sm rounded-md border border-border/60 bg-background p-2"
                    placeholder="Contexto opcional exibido em destaque na apresentação."
                  />
                </label>
                <div className="space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Imagem representativa</span>
                  {editingUrl ? (
                    <div className="flex items-center gap-2">
                      <img src={editingUrl} alt="" className="size-14 rounded-md object-cover border border-border/60" />
                      <div className="flex-1 text-xs text-muted-foreground truncate">{editingItem.imageName}</div>
                      <Button size="sm" variant="ghost" onClick={() => clearImage(editingItem)}>Remover</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => attachImage(editingItem)} className="gap-1.5">
                      <ImageIcon className="size-3.5" /> Enviar imagem
                    </Button>
                  )}
                </div>
                <ColorField label="Cor desta barra" value={editingItem.color ?? config.barColor}
                  onChange={(v) => updateNode(project.id, editingItem.id, { color: v })}
                  onClear={() => updateNode(project.id, editingItem.id, { color: undefined } as Partial<MindNode>)}
                />
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                <div className="text-foreground font-semibold mb-2">Inspetor</div>
                <p>Clique em uma barra ou linha da lista para editar seus detalhes.</p>
                <ul className="mt-3 space-y-1 text-xs list-disc pl-4">
                  <li>Adicione até dezenas de itens.</li>
                  <li>Use a escala <b>Comprimida</b> quando os valores tiverem grandes diferenças.</li>
                  <li>Na apresentação, a câmera navega barra a barra e sobe até a imagem no topo.</li>
                </ul>
              </div>
            )}
          </aside>
        </div>
      </main>

      {recordOpen && (
        <RecordFormatMenu open={recordOpen} onClose={() => setRecordOpen(false)} onPick={onPickFormat} />
      )}
    </div>
  );
}

/* ---------- small controls ---------- */
function SortBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-1 rounded-md border transition inline-flex items-center gap-1 ${
        active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border/60"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ColorField({ label, value, onChange, onClear }: { label: string; value: string; onChange: (v: string) => void; onClear?: () => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={toHexInput(value)} onChange={(e) => onChange(e.target.value)}
          className="size-8 rounded border border-border/60 bg-transparent cursor-pointer" />
        {onClear && (
          <Button size="sm" variant="ghost" onClick={onClear}>Padrão</Button>
        )}
      </div>
    </label>
  );
}

/** Some stored colors may be rgb(...); the <input type="color"> only accepts hex. */
function toHexInput(v: string): string {
  if (v?.startsWith?.("#")) return v;
  const m = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i.exec(v ?? "");
  if (!m) return DEFAULT_SCALE.barColor;
  const to = (x: string) => Number(x).toString(16).padStart(2, "0");
  return `#${to(m[1])}${to(m[2])}${to(m[3])}`;
}
