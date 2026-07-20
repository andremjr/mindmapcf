import { useEffect, useState } from "react";
import { X, Upload, Trash2 } from "lucide-react";
import type { Project, SonicAvatar } from "@/lib/types";
import { pickMediaAndStore, resolveImage } from "@/lib/imageStorage";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

const DEFAULT: SonicAvatar = {
  enabled: true,
  bgColor: "#0f172a",
  waveColor: "#22d3ee",
  sizePct: 18,
  xPct: 12,
  yPct: 82,
};

const BG_SWATCHES = [
  "#0f172a", "#111827", "#1f2937", "#ffffff", "#f5f5f4",
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899",
];
const WAVE_SWATCHES = [
  "#22d3ee", "#a78bfa", "#f472b6", "#fbbf24", "#4ade80",
  "#f87171", "#ffffff", "#0ea5e9",
];

export function SonicAvatarDialog({
  project,
  open,
  onClose,
}: {
  project: Project;
  open: boolean;
  onClose: () => void;
}) {
  const setSonicAvatar = useStore((s) => s.setSonicAvatar);
  const avatar: SonicAvatar = project.sonicAvatar ?? DEFAULT;
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!avatar.imageRef) {
      setPreview(null);
      return;
    }
    resolveImage(avatar.imageRef).then((url) => {
      if (!cancelled) setPreview(url);
    });
    return () => {
      cancelled = true;
    };
  }, [avatar.imageRef?.id, avatar.imageRef?.storagePath]);

  if (!open) return null;

  async function pickImage() {
    try {
      const ref = await pickMediaAndStore("image");
      if (!ref) return;
      setSonicAvatar(project.id, {
        enabled: true,
        imageRef: ref,
        imageName: ref.name,
      });
    } catch (err) {
      console.error("[sonic-avatar] pick", err);
      toast.error("Não foi possível carregar a imagem.");
    }
  }

  function remove() {
    setSonicAvatar(project.id, null);
    setPreview(null);
  }

  function update(patch: Partial<SonicAvatar>) {
    setSonicAvatar(project.id, patch);
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur grid place-items-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/60 bg-card shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Avatar sonoro</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Círculo com sua imagem e ondas do áudio ao vivo. Aparece dentro do
              quadro durante a gravação — arraste para reposicionar.
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

        <div className="p-6 space-y-5">
          {/* Preview + upload */}
          <div className="flex items-center gap-4">
            <div
              className="size-24 rounded-full shrink-0 overflow-hidden border border-border/60 grid place-items-center"
              style={{ background: avatar.bgColor }}
            >
              {preview ? (
                <img
                  src={preview}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[10px] text-muted-foreground text-center px-2">
                  sem imagem
                </span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <button
                onClick={pickImage}
                className="inline-flex items-center gap-2 rounded-md border border-border/60 hover:border-primary hover:bg-muted/50 px-3 py-2 text-xs w-full justify-center"
              >
                <Upload className="size-3.5" />
                {avatar.imageRef ? "Trocar imagem" : "Enviar imagem (1:1 ideal)"}
              </button>
              {avatar.imageRef && (
                <button
                  onClick={remove}
                  className="inline-flex items-center gap-2 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 px-3 py-2 text-xs w-full justify-center"
                >
                  <Trash2 className="size-3.5" />
                  Remover avatar
                </button>
              )}
              <p className="text-[10px] text-muted-foreground">
                PNG transparente: a cor do círculo aparece atrás. Imagem
                quadrada: recortada no molde do círculo.
              </p>
            </div>
          </div>

          {/* Toggle enabled */}
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={avatar.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
              className="accent-primary"
            />
            Mostrar avatar durante a gravação
          </label>

          {/* Bg color */}
          <section>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Cor do círculo
            </div>
            <div className="flex flex-wrap gap-1.5">
              {BG_SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => update({ bgColor: c })}
                  className={`size-6 rounded-full border ${
                    avatar.bgColor === c
                      ? "border-foreground ring-2 ring-foreground/30"
                      : "border-border/60 hover:scale-110"
                  } transition`}
                  style={{ background: c }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={avatar.bgColor}
                onChange={(e) => update({ bgColor: e.target.value })}
                className="size-6 rounded-full border border-border/60 bg-transparent cursor-pointer"
                title="Cor personalizada"
              />
            </div>
          </section>

          {/* Wave color */}
          <section>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Cor das ondas sonoras
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WAVE_SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => update({ waveColor: c })}
                  className={`size-6 rounded-full border ${
                    avatar.waveColor === c
                      ? "border-foreground ring-2 ring-foreground/30"
                      : "border-border/60 hover:scale-110"
                  } transition`}
                  style={{ background: c }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={avatar.waveColor}
                onChange={(e) => update({ waveColor: e.target.value })}
                className="size-6 rounded-full border border-border/60 bg-transparent cursor-pointer"
                title="Cor personalizada"
              />
            </div>
          </section>

          {/* Size slider */}
          <section>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Tamanho
              </label>
              <span className="text-xs font-mono tabular-nums text-muted-foreground">
                {avatar.sizePct}%
              </span>
            </div>
            <input
              type="range"
              min={6}
              max={40}
              step={1}
              value={avatar.sizePct}
              onChange={(e) => update({ sizePct: Number(e.target.value) })}
              className="w-full accent-primary"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Dica: você pode arrastar o avatar dentro do quadro durante a
              gravação para reposicionar.
            </p>
          </section>
        </div>

        <div className="px-6 py-3 border-t border-border/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            Pronto
          </button>
        </div>
      </div>
    </div>
  );
}
