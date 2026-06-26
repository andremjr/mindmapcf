import { useEffect, useRef } from "react";
import {
  Play,
  Pause,
  Rewind,
  FastForward,
  SkipBack,
  SkipForward,
  Camera,
  CameraOff,
} from "lucide-react";
import type { Project, TranscriptBlock, BlockType } from "@/lib/types";
import { useStore } from "@/lib/store";

const TYPE_COLOR: Record<BlockType, string> = {
  intro: "oklch(0.78 0.16 220)",
  main_idea: "oklch(0.78 0.16 220)",
  detail: "oklch(0.55 0.04 260)",
  contrast: "oklch(0.78 0.17 60)",
  problem: "oklch(0.62 0.22 25)",
  solution: "oklch(0.74 0.16 160)",
  example: "oklch(0.68 0.18 305)",
  conclusion: "oklch(0.78 0.16 220)",
  warning: "oklch(0.7 0.2 20)",
};

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(1);
  return `${m}:${r.padStart(4, "0")}`;
}

export function Timeline({ project }: { project: Project }) {
  const playback = useStore((s) => s.playback);
  const setTime = useStore((s) => s.setTime);
  const setPlaying = useStore((s) => s.setPlaying);
  const setSpeed = useStore((s) => s.setSpeed);
  const setAutoCamera = useStore((s) => s.setAutoCamera);
  const setSelected = useStore((s) => s.setSelectedNode);

  const duration = Math.max(project.durationSec, 1);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    if (!playback.playing) return;
    lastRef.current = performance.now();
    const tick = (t: number) => {
      const dt = ((t - lastRef.current) / 1000) * playback.speed;
      lastRef.current = t;
      const next = playback.time + dt;
      if (next >= duration) {
        setTime(duration);
        setPlaying(false);
        return;
      }
      setTime(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.playing, playback.speed, duration]);

  const seek = (t: number) => setTime(Math.max(0, Math.min(duration, t)));

  const blockAt = (t: number) => {
    for (let i = project.blocks.length - 1; i >= 0; i--) {
      if (t >= project.blocks[i].start) return i;
    }
    return 0;
  };

  const prevBlock = () => {
    const i = blockAt(playback.time);
    const target = project.blocks[Math.max(0, i - 1)];
    if (target) {
      seek(target.start);
      setSelected(`n_${target.id}`);
    }
  };
  const nextBlock = () => {
    const i = blockAt(playback.time);
    const target = project.blocks[Math.min(project.blocks.length - 1, i + 1)];
    if (target) {
      seek(target.start);
      setSelected(`n_${target.id}`);
    }
  };

  const onLaneClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    seek(ratio * duration);
  };

  return (
    <div className="h-44 shrink-0 border-t border-border/60 bg-sidebar/40 backdrop-blur flex flex-col">
      <div className="h-10 flex items-center px-3 gap-2 border-b border-border/40">
        <button
          onClick={() => seek(playback.time - 5)}
          className="size-7 rounded grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted/60"
          title="-5s"
        >
          <Rewind className="size-3.5" />
        </button>
        <button
          onClick={prevBlock}
          className="size-7 rounded grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted/60"
          title="Bloco anterior"
        >
          <SkipBack className="size-3.5" />
        </button>
        <button
          onClick={() => setPlaying(!playback.playing)}
          className="size-8 rounded-md bg-primary text-primary-foreground grid place-items-center hover:bg-primary/90 transition"
          aria-label={playback.playing ? "Pausar" : "Reproduzir"}
        >
          {playback.playing ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}
        </button>
        <button
          onClick={nextBlock}
          className="size-7 rounded grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted/60"
          title="Próximo bloco"
        >
          <SkipForward className="size-3.5" />
        </button>
        <button
          onClick={() => seek(playback.time + 5)}
          className="size-7 rounded grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted/60"
          title="+5s"
        >
          <FastForward className="size-3.5" />
        </button>

        <div className="text-mono text-xs text-muted-foreground ml-2">
          <span className="text-foreground">{fmt(playback.time)}</span> / {fmt(duration)}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={playback.speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="text-[11px] bg-transparent border border-border/60 rounded px-1.5 py-0.5 text-foreground"
            title="Velocidade"
          >
            {[0.25, 0.5, 1, 1.5, 2].map((v) => (
              <option key={v} value={v} className="bg-background">
                {v}×
              </option>
            ))}
          </select>
          <button
            onClick={() => setAutoCamera(!playback.autoCamera)}
            className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded border ${
              playback.autoCamera
                ? "border-primary/60 text-primary"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
            title="Auto-câmera"
          >
            {playback.autoCamera ? <Camera className="size-3" /> : <CameraOff className="size-3" />}
            Auto-cam
          </button>
        </div>
      </div>

      <div className="flex-1 px-3 py-2 overflow-x-auto">
        <div className="relative h-4 mb-1" onClick={onLaneClick}>
          {Array.from({ length: Math.ceil(duration / 10) + 1 }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 text-[9px] text-mono text-muted-foreground"
              style={{ left: `${(i * 10 / duration) * 100}%` }}
            >
              <div className="h-2 w-px bg-border" />
              {i * 10}s
            </div>
          ))}
        </div>

        <div
          className="relative h-7 bg-muted/30 rounded border border-border/40 cursor-pointer"
          onClick={onLaneClick}
        >
          {project.blocks.map((b: TranscriptBlock) => (
            <button
              key={b.id}
              onClick={(e) => {
                e.stopPropagation();
                seek(b.start);
                setSelected(`n_${b.id}`);
              }}
              className="absolute top-0.5 bottom-0.5 rounded text-[10px] text-mono px-1.5 overflow-hidden whitespace-nowrap text-foreground/90 hover:brightness-125 transition text-left"
              style={{
                left: `${(b.start / duration) * 100}%`,
                width: `${(b.duration / duration) * 100}%`,
                background: `color-mix(in oklch, ${TYPE_COLOR[b.type]} 25%, transparent)`,
                borderLeft: `2px solid ${TYPE_COLOR[b.type]}`,
              }}
              title={b.text}
            >
              {b.shortText}
            </button>
          ))}
          <div
            className="absolute top-0 bottom-0 w-px bg-primary pointer-events-none"
            style={{ left: `${(playback.time / duration) * 100}%` }}
          >
            <div className="size-2 -ml-1 -mt-0.5 rounded-full bg-primary shadow-[0_0_8px_2px_var(--color-primary)]" />
          </div>
        </div>

        <div className="relative h-3 mt-2">
          {project.sfx.map((s) => (
            <div
              key={s.id}
              className="absolute top-0 bottom-0 w-1 bg-accent rounded-full"
              style={{ left: `${(s.time / duration) * 100}%`, opacity: 0.4 + s.volume * 0.5 }}
              title={`${s.kind} @ ${s.time.toFixed(2)}s`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
