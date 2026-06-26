import { useState } from "react";
import { Split, Combine, Trash2, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import type { Project, TranscriptBlock, BlockType } from "@/lib/types";
import { BLOCK_TYPE_LABEL } from "@/lib/types";

const TYPES: BlockType[] = [
  "intro","main_idea","detail","contrast","problem","solution","example","conclusion","warning",
];

const TYPE_COLOR: Record<BlockType, string> = {
  intro: "border-l-primary",
  main_idea: "border-l-primary",
  detail: "border-l-muted-foreground/40",
  contrast: "border-l-chart-4",
  problem: "border-l-destructive",
  solution: "border-l-chart-3",
  example: "border-l-accent",
  conclusion: "border-l-primary",
  warning: "border-l-chart-5",
};

function fmt(s: number) {
  return s.toFixed(2);
}

export function BlocksReview({ project }: { project: Project }) {
  const updateBlock = useStore((s) => s.updateBlock);
  const removeBlock = useStore((s) => s.removeBlock);
  const mergeWithNext = useStore((s) => s.mergeWithNext);
  const splitBlockAt = useStore((s) => s.splitBlockAt);
  const setStatus = useStore((s) => s.setStatus);

  if (project.blocks.length === 0) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <div className="surface-card p-12 text-center">
          <p className="text-muted-foreground">
            Gere blocos a partir da transcrição para começar a revisar.
          </p>
        </div>
      </div>
    );
  }

  function handleGenerateCanvas() {
    setStatus(project.id, "canvas_generated");
    toast.success("Canvas narrativo pronto (mock)");
  }

  const totalDur = project.blocks.reduce((acc, b) => acc + b.duration, 0);

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-display text-xl">Blocos de fala</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {project.blocks.length} blocos · {totalDur.toFixed(1)}s total · alvo 5–12s, ≤120 chars.
          </p>
        </div>
        <Button onClick={handleGenerateCanvas} className="gap-2">
          <Sparkles className="size-4" /> Gerar canvas narrativo <ArrowRight className="size-4" />
        </Button>
      </div>

      <div className="space-y-3">
        {project.blocks.map((b, i) => (
          <BlockCard
            key={b.id}
            block={b}
            index={i}
            total={project.blocks.length}
            onChange={(patch) => updateBlock(project.id, b.id, patch)}
            onDelete={() => removeBlock(project.id, b.id)}
            onMerge={() => mergeWithNext(project.id, b.id)}
            onSplit={(at) => splitBlockAt(project.id, b.id, at)}
          />
        ))}
      </div>
    </div>
  );
}

function BlockCard({
  block,
  index,
  total,
  onChange,
  onDelete,
  onMerge,
  onSplit,
}: {
  block: TranscriptBlock;
  index: number;
  total: number;
  onChange: (patch: Partial<TranscriptBlock>) => void;
  onDelete: () => void;
  onMerge: () => void;
  onSplit: (atChar: number) => void;
}) {
  const [splitAt, setSplitAt] = useState<number>(Math.floor(block.text.length / 2));
  const overChar = block.text.length > 120;
  const overDur = block.duration > 12;
  const underDur = block.duration < 5;

  return (
    <div className={`surface-card border-l-4 ${TYPE_COLOR[block.type]} p-4 space-y-3`}>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-mono text-muted-foreground">#{(index + 1).toString().padStart(2, "0")}</span>
        <span className="text-mono text-muted-foreground">{fmt(block.start)} → {fmt(block.end)}</span>
        <span className={`text-mono ${overDur || underDur ? "text-chart-4" : "text-muted-foreground"}`}>
          {block.duration.toFixed(1)}s
        </span>
        <span className={`text-mono ${overChar ? "text-destructive" : "text-muted-foreground"}`}>
          {block.text.length} chars
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Select value={block.type} onValueChange={(v) => onChange({ type: v as BlockType })}>
            <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>{BLOCK_TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Textarea
        value={block.text}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={2}
        className="resize-none"
      />

      <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Short text</div>
          <Input
            value={block.shortText}
            onChange={(e) => onChange({ shortText: e.target.value })}
            maxLength={80}
          />
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={splitAt}
            onChange={(e) => setSplitAt(Number(e.target.value))}
            min={1}
            max={block.text.length - 1}
            className="w-20 text-mono text-xs"
          />
          <Button variant="ghost" size="sm" onClick={() => onSplit(splitAt)}>
            <Split className="size-4 mr-1" /> Dividir
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onMerge}
            disabled={index >= total - 1}
          >
            <Combine className="size-4 mr-1" /> Juntar
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {block.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {block.keywords.map((k) => (
            <span key={k} className="text-[10px] text-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
              {k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
