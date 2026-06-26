import { useState, useRef, useEffect } from "react";
import { Play, Pause } from "lucide-react";
import type { Project, TranscriptBlock, BlockType } from "@/lib/types";

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
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);
  const duration = Math.max(project.durationSec, 1);

  useEffect(() => {
    if (!playing) return;
    lastRef.current = performance.now();
    const tick = (t: number) => {
      const dt = (t - lastRef.current) / 1000;
      lastRef.current = t;
      setTime((prev) => {
        const n = prev + dt;
        if (n >= duration) {
          setPlaying(false);
          return duration;
        }
        return n;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, duration]);

  return (
    <div className="h-40 shrink-0 border-t border-border/60 bg-sidebar/40 backdrop-blur flex flex-col">
      <div className="h-10 flex items-center px-3 gap-3 border-b border-border/40">
        <button
          onClick={() => setPlaying((p) => !p)}
          className="size-7 rounded-md bg-primary text-primary-foreground grid place-items-center hover:bg-primary/90 transition"
          aria-label={playing ? "Pausar" : "Reproduzir"}
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 ml-0.5" />}
        </button>
        <div className="text-mono text-xs text-muted-foreground">
          <span className="text-foreground">{fmt(time)}</span> / {fmt(duration)}
        </div>
        <div className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">
          Timeline
        </div>
      </div>

      <div className="flex-1 px-3 py-2 overflow-x-auto">
        {/* Ruler */}
        <div className="relative h-4 mb-1">
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

        {/* Block lane */}
        <div className="relative h-7 bg-muted/30 rounded border border-border/40">
          {project.blocks.map((b: TranscriptBlock) => (
            <div
              key={b.id}
              className="absolute top-0.5 bottom-0.5 rounded text-[10px] text-mono px-1.5 overflow-hidden whitespace-nowrap text-foreground/90 cursor-pointer hover:brightness-125 transition"
              style={{
                left: `${(b.start / duration) * 100}%`,
                width: `${(b.duration / duration) * 100}%`,
                background: `color-mix(in oklch, ${TYPE_COLOR[b.type]} 25%, transparent)`,
                borderLeft: `2px solid ${TYPE_COLOR[b.type]}`,
              }}
              title={b.text}
            >
              {b.shortText}
            </div>
          ))}
          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-primary pointer-events-none"
            style={{ left: `${(time / duration) * 100}%` }}
          >
            <div className="size-2 -ml-1 -mt-0.5 rounded-full bg-primary shadow-[0_0_8px_2px_var(--color-primary)]" />
          </div>
        </div>

        {/* SFX lane */}
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
