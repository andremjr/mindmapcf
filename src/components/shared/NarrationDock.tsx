import { useEffect, useRef, useState } from "react";
import { Mic, Play, Pause, Upload, X } from "lucide-react";
import { toast } from "sonner";

import type { Project } from "@/lib/types";
import { useStore } from "@/lib/store";
import { pickMediaAndStore, resolveImage } from "@/lib/imageStorage";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";

/**
 * Floating narration control shared by every editor (mindmap, tierlist,
 * ranking, bracket, matrix, iceberg). Uses the same store action
 * (`setNarration`) that the presentation/recording pipelines already read,
 * so attached audio is picked up automatically during recording.
 */
export function NarrationDock({
  projectId,
  narrationRef,
  className,
}: {
  projectId: string;
  narrationRef: Project["narrationRef"];
  className?: string;
}) {
  const setNarration = useStore((s) => s.setNarration);
  const { user } = useAuth();
  const { isPro } = useSubscription(user?.id);

  const [expanded, setExpanded] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let revoke: string | null = null;
    let alive = true;
    (async () => {
      if (!narrationRef) {
        setUrl(null);
        return;
      }
      try {
        const u = await resolveImage(narrationRef);
        if (!alive) return;
        setUrl(u);
        if (u && u.startsWith("blob:")) revoke = u;
      } catch (e) {
        console.error("[narration] resolve", e);
        setUrl(null);
      }
    })();
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [narrationRef]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onMeta = () => setDuration(a.duration || 0);
    const onEnd = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, [url]);

  async function onAttach() {
    if (!isPro) {
      toast.error("Narração pré-gravada é um recurso Pro.");
      return;
    }
    const ref = await pickMediaAndStore("audio");
    if (ref) {
      setNarration(projectId, ref);
      toast.success(`Narração anexada: ${ref.name}`);
    }
  }
  function onRemove() {
    setNarration(projectId, null);
  }

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const fmt = (t: number) => {
    if (!isFinite(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={
          "rounded-full border border-border/60 bg-popover/85 backdrop-blur px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary flex items-center gap-1.5 " +
          (className ?? "")
        }
        title="Narração"
      >
        <Mic className="size-3.5" />
        Narração{narrationRef ? " •" : ""}
      </button>
    );
  }

  return (
    <div
      className={
        "rounded-lg border border-border/60 bg-popover/90 backdrop-blur p-3 text-[11px] text-muted-foreground w-[280px] " +
        (className ?? "")
      }
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-foreground/80 font-semibold">
          <Mic className="size-3.5" />
          Narração {isPro ? "" : "(Pro)"}
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded"
          aria-label="Recolher narração"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {narrationRef && url ? (
        <>
          <audio ref={audioRef} src={url} preload="metadata" />
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="size-8 rounded-full bg-primary text-primary-foreground grid place-items-center hover:opacity-90"
              aria-label={playing ? "Pausar" : "Reproduzir"}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}
            </button>
            <div className="flex-1 min-w-0">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={current}
                onChange={(e) => {
                  const a = audioRef.current;
                  if (!a) return;
                  a.currentTime = Number(e.target.value);
                  setCurrent(a.currentTime);
                }}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] tabular-nums">
                <span>{fmt(current)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="truncate text-[10px] text-muted-foreground/80" title={narrationRef.name}>
              {narrationRef.name}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={onAttach} className="text-[10px] hover:text-foreground">Trocar</button>
              <button onClick={onRemove} className="text-[10px] hover:text-destructive">Remover</button>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="text-[11px] leading-relaxed mb-2">
            Anexe um áudio (mp3/wav/m4a) para ouvir enquanto edita. Ao gravar, ele será usado automaticamente.
          </p>
          <button
            onClick={onAttach}
            className="w-full inline-flex items-center justify-center gap-2 text-xs rounded-md border border-border/60 hover:border-primary hover:bg-muted/50 px-3 py-1.5"
          >
            <Upload className="size-3.5" />
            Anexar áudio
          </button>
        </>
      )}
    </div>
  );
}
