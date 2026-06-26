import { Layers, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { generateBlocks } from "@/lib/blockGenerator";
import type { Project } from "@/lib/types";

function fmt(s: number) {
  return s.toFixed(2);
}

export function TranscriptPanel({ project }: { project: Project }) {
  const setBlocks = useStore((s) => s.setBlocks);
  const tr = project.transcript;

  if (!tr) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <div className="surface-card p-12 text-center">
          <p className="text-muted-foreground">
            Transcreva o áudio primeiro para ver as palavras com timestamps aqui.
          </p>
        </div>
      </div>
    );
  }

  function handleGenerate() {
    if (!tr) return;
    const blocks = generateBlocks(tr);
    setBlocks(project.id, blocks);
    toast.success(`${blocks.length} blocos gerados`);
  }

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-display text-xl">Transcrição</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {tr.words.length} palavras · {tr.paragraphs.length} parágrafos · {tr.language} · {Math.round(tr.durationSec)}s
          </p>
        </div>
        <Button onClick={handleGenerate} className="gap-2">
          <Layers className="size-4" /> Gerar blocos de fala <ArrowRight className="size-4" />
        </Button>
      </div>

      <div className="surface-card p-6">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Texto completo</h3>
        <p className="text-foreground/90 leading-relaxed">{tr.text}</p>
      </div>

      <div className="surface-card p-6">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Parágrafos</h3>
        <div className="space-y-3">
          {tr.paragraphs.map((p) => (
            <div key={p.id} className="flex gap-4 py-2 border-b border-border/40 last:border-0">
              <span className="text-mono text-xs text-muted-foreground shrink-0 w-24">
                {fmt(p.start)} → {fmt(p.end)}
              </span>
              <p className="text-sm text-foreground/90 flex-1">{p.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="surface-card p-6">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
          Palavras com timestamps
        </h3>
        <div className="flex flex-wrap gap-1.5 max-h-72 overflow-y-auto">
          {tr.words.map((w) => (
            <span
              key={w.id}
              title={`${fmt(w.start)} → ${fmt(w.end)}`}
              className="text-xs px-1.5 py-0.5 rounded bg-muted/40 hover:bg-primary/20 hover:text-primary transition cursor-default"
            >
              {w.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
