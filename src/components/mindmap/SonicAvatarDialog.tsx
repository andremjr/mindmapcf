import { useEffect, useState } from "react";
import { X, Upload, Trash2, Plus, Lock, Check, Crown } from "lucide-react";
import type { SonicAvatarEntry } from "@/lib/types";
import { pickMediaAndStore, resolveImage } from "@/lib/imageStorage";
import { useStore } from "@/lib/store";
import {
  createAvatarRemote,
  updateAvatarRemote,
  deleteAvatarRemote,
} from "@/lib/avatarsSync";
import { toast } from "sonner";

const BG_SWATCHES = [
  "#0f172a", "#111827", "#1f2937", "#ffffff", "#f5f5f4",
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899",
];
const WAVE_SWATCHES = [
  "#22d3ee", "#a78bfa", "#f472b6", "#fbbf24", "#4ade80",
  "#f87171", "#ffffff", "#0ea5e9",
];

const DEFAULT_NEW: Omit<SonicAvatarEntry, "id"> = {
  name: "Meu avatar",
  bgColor: "#0f172a",
  waveColor: "#22d3ee",
  sizePct: 18,
};

/**
 * User-scoped avatar library dialog. Manages the up-to-10 avatars a Pro user
 * can save (channel identity — reused across all mind maps). When
 * `selectionProjectId` is provided, avatars are selectable to be used
 * in that specific mind map's recordings.
 */
export function SonicAvatarDialog({
  userId,
  isPro,
  open,
  onClose,
  selectionProjectId,
  onUpgrade,
}: {
  userId: string;
  isPro: boolean;
  open: boolean;
  onClose: () => void;
  /** When provided, dialog also lets the user pick which avatar to use in that project. */
  selectionProjectId?: string;
  /** Called when a free-plan user tries to create an avatar. */
  onUpgrade?: () => void;
}) {
  const avatars = useStore((s) => s.avatars);
  const projects = useStore((s) => s.projects);
  const setSonicAvatar = useStore((s) => s.setSonicAvatar);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const selectedProject = selectionProjectId
    ? projects.find((p) => p.id === selectionProjectId)
    : undefined;
  const currentAvatarId = selectedProject?.sonicAvatar?.avatarId;

  if (!open) return null;

  async function handleCreate() {
    if (!isPro) {
      onUpgrade?.();
      return;
    }
    if (avatars.length >= 10) {
      toast.error("Limite de 10 avatares atingido.");
      return;
    }
    setCreating(true);
    const created = await createAvatarRemote(userId, DEFAULT_NEW);
    setCreating(false);
    if (created) {
      setEditingId(created.id);
    }
  }

  function selectForProject(avatarId: string) {
    if (!selectionProjectId) return;
    setSonicAvatar(selectionProjectId, {
      avatarId,
      enabled: true,
      xPct: selectedProject?.sonicAvatar?.xPct ?? 12,
      yPct: selectedProject?.sonicAvatar?.yPct ?? 82,
    });
    toast.success("Avatar selecionado para este mapa.");
  }

  function unlinkFromProject() {
    if (!selectionProjectId) return;
    setSonicAvatar(selectionProjectId, null);
  }

  const editingAvatar = editingId ? avatars.find((a) => a.id === editingId) : undefined;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur grid place-items-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border/60 bg-card shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-border/60 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              Avatares sonoros
              <span className="text-[10px] uppercase tracking-wider rounded-full bg-primary/15 text-primary px-2 py-0.5 border border-primary/30">
                Pro
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Círculo com sua imagem + ondas do áudio ao vivo. Sua identidade
              de canal — reutilize em qualquer mapa. Máximo 10 avatares.
            </p>
          </div>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-full hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </div>

        {!isPro ? (
          <div className="p-8 text-center space-y-4">
            <div className="mx-auto size-14 rounded-full bg-primary/10 grid place-items-center">
              <Lock className="size-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Exclusivo do plano Pro</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Avatares sonoros aparecem dentro do vídeo durante a gravação
                e representam seu canal. Assine o Pro para criar até 10.
              </p>
            </div>
            <button
              onClick={() => {
                onClose();
                onUpgrade?.();
              }}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90"
            >
              <Crown className="size-4" /> Ver o Plano Pro
            </button>
          </div>
        ) : editingAvatar ? (
          <EditForm
            key={editingAvatar.id}
            entry={editingAvatar}
            onDone={() => setEditingId(null)}
            onDelete={async () => {
              await deleteAvatarRemote(editingAvatar.id);
              // Also unlink from any project that referenced it.
              for (const p of projects) {
                if (p.sonicAvatar?.avatarId === editingAvatar.id) {
                  setSonicAvatar(p.id, null);
                }
              }
              setEditingId(null);
            }}
          />
        ) : (
          <>
            <div className="p-5 flex-1 overflow-auto">
              {avatars.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    Nenhum avatar ainda. Crie o primeiro.
                  </p>
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
                  >
                    <Plus className="size-4" /> Criar avatar
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {avatars.map((a) => (
                    <AvatarCard
                      key={a.id}
                      entry={a}
                      selected={currentAvatarId === a.id}
                      selectionMode={!!selectionProjectId}
                      onEdit={() => setEditingId(a.id)}
                      onSelect={() => selectForProject(a.id)}
                    />
                  ))}
                  {avatars.length < 10 && (
                    <button
                      onClick={handleCreate}
                      disabled={creating}
                      className="rounded-xl border border-dashed border-border/60 hover:border-primary hover:bg-muted/40 min-h-[160px] grid place-items-center text-xs text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Plus className="size-5" />
                        Novo avatar
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-border/60 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {avatars.length}/10 avatares
                {selectionProjectId && currentAvatarId && (
                  <button
                    onClick={unlinkFromProject}
                    className="ml-3 text-destructive hover:underline"
                  >
                    Remover deste mapa
                  </button>
                )}
              </div>
              <button
                onClick={onClose}
                className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90"
              >
                Pronto
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AvatarCard({
  entry,
  selected,
  selectionMode,
  onEdit,
  onSelect,
}: {
  entry: SonicAvatarEntry;
  selected: boolean;
  selectionMode: boolean;
  onEdit: () => void;
  onSelect: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!entry.imageRef) return setUrl(null);
    resolveImage(entry.imageRef).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [entry.imageRef?.id, entry.imageRef?.storagePath]);

  return (
    <div
      className={`group relative rounded-xl border overflow-hidden bg-muted/20 ${
        selected ? "border-primary ring-2 ring-primary/40" : "border-border/60 hover:border-primary/40"
      }`}
    >
      <div className="aspect-square grid place-items-center p-4" style={{ background: entry.bgColor }}>
        {url ? (
          <img src={url} alt="" className="w-24 h-24 rounded-full object-cover" />
        ) : (
          <div className="w-24 h-24 rounded-full border border-white/10 grid place-items-center text-[10px] text-white/60">
            sem imagem
          </div>
        )}
        {selected && (
          <div className="absolute top-2 right-2 rounded-full bg-primary text-primary-foreground p-1">
            <Check className="size-3.5" />
          </div>
        )}
      </div>
      <div className="p-2 flex items-center gap-1 border-t border-border/60 bg-background">
        <div className="flex-1 truncate text-xs font-medium" title={entry.name}>
          {entry.name}
        </div>
        <button
          onClick={onEdit}
          className="text-[11px] px-2 py-1 rounded hover:bg-muted"
        >
          Editar
        </button>
        {selectionMode && !selected && (
          <button
            onClick={onSelect}
            className="text-[11px] px-2 py-1 rounded bg-primary/15 text-primary hover:bg-primary/25"
          >
            Usar
          </button>
        )}
      </div>
    </div>
  );
}

function EditForm({
  entry,
  onDone,
  onDelete,
}: {
  entry: SonicAvatarEntry;
  onDone: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(entry.name);
  const [bgColor, setBgColor] = useState(entry.bgColor);
  const [waveColor, setWaveColor] = useState(entry.waveColor);
  const [sizePct, setSizePct] = useState(entry.sizePct);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!entry.imageRef) return setPreview(null);
    resolveImage(entry.imageRef).then((u) => {
      if (!cancelled) setPreview(u);
    });
    return () => {
      cancelled = true;
    };
  }, [entry.imageRef?.id, entry.imageRef?.storagePath]);

  async function pickImage() {
    try {
      const ref = await pickMediaAndStore("image");
      if (!ref) return;
      await updateAvatarRemote(entry.id, { imageRef: ref, imageName: ref.name });
    } catch (err) {
      console.error(err);
      toast.error("Falha ao carregar imagem.");
    }
  }
  async function removeImage() {
    await updateAvatarRemote(entry.id, { imageRef: undefined, imageName: undefined });
    setPreview(null);
  }
  function saveAll() {
    updateAvatarRemote(entry.id, { name, bgColor, waveColor, sizePct });
    onDone();
  }

  return (
    <div className="p-6 space-y-5 overflow-auto">
      <div>
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Nome
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full bg-background border border-border/60 rounded-md px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-4">
        <div
          className="size-24 rounded-full shrink-0 overflow-hidden border border-border/60 grid place-items-center"
          style={{ background: bgColor }}
        >
          {preview ? (
            <img src={preview} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] text-white/70 text-center px-2">sem imagem</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <button
            onClick={pickImage}
            className="inline-flex items-center gap-2 rounded-md border border-border/60 hover:border-primary hover:bg-muted/50 px-3 py-2 text-xs w-full justify-center"
          >
            <Upload className="size-3.5" />
            {entry.imageRef ? "Trocar imagem" : "Enviar imagem (1:1 ideal)"}
          </button>
          {entry.imageRef && (
            <button
              onClick={removeImage}
              className="inline-flex items-center gap-2 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 px-3 py-2 text-xs w-full justify-center"
            >
              <Trash2 className="size-3.5" /> Remover imagem
            </button>
          )}
          <p className="text-[10px] text-muted-foreground">
            PNG transparente: a cor do círculo aparece atrás. Imagem quadrada: recortada no molde.
          </p>
        </div>
      </div>

      <section>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
          Cor do círculo
        </div>
        <div className="flex flex-wrap gap-1.5">
          {BG_SWATCHES.map((c) => (
            <button
              key={c}
              onClick={() => setBgColor(c)}
              className={`size-6 rounded-full border ${
                bgColor === c ? "border-foreground ring-2 ring-foreground/30" : "border-border/60 hover:scale-110"
              } transition`}
              style={{ background: c }}
              title={c}
            />
          ))}
          <input
            type="color"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            className="size-6 rounded-full border border-border/60 bg-transparent cursor-pointer"
          />
        </div>
      </section>

      <section>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
          Cor das ondas sonoras
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WAVE_SWATCHES.map((c) => (
            <button
              key={c}
              onClick={() => setWaveColor(c)}
              className={`size-6 rounded-full border ${
                waveColor === c ? "border-foreground ring-2 ring-foreground/30" : "border-border/60 hover:scale-110"
              } transition`}
              style={{ background: c }}
              title={c}
            />
          ))}
          <input
            type="color"
            value={waveColor}
            onChange={(e) => setWaveColor(e.target.value)}
            className="size-6 rounded-full border border-border/60 bg-transparent cursor-pointer"
          />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Tamanho
          </label>
          <span className="text-xs font-mono tabular-nums text-muted-foreground">
            {sizePct}%
          </span>
        </div>
        <input
          type="range"
          min={6}
          max={40}
          step={1}
          value={sizePct}
          onChange={(e) => setSizePct(Number(e.target.value))}
          className="w-full accent-primary"
        />
      </section>

      <div className="flex justify-between items-center pt-2 border-t border-border/60">
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-3.5" /> Excluir avatar
        </button>
        <div className="flex gap-2">
          <button onClick={onDone} className="text-sm px-3 py-2 rounded-md hover:bg-muted">
            Cancelar
          </button>
          <button
            onClick={saveAll}
            className="text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
