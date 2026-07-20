import { useRef, useState } from "react";
import { Copy, Upload, Sparkles, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AI_IMPORT_PROMPT } from "@/lib/aiImportPrompt";

interface Props {
  open: boolean;
  onClose: () => void;
  /** File picked by the user (or synthesized from pasted text). */
  onFile: (file: File) => Promise<void> | void;
  title?: string;
  warning?: string;
}

export function ImportDialog({ open, onClose, onFile, title = "Importar mapa mental", warning }: Props) {
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(AI_IMPORT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const ta = document.getElementById("ai-import-prompt-ta") as HTMLTextAreaElement | null;
      ta?.select();
      document.execCommand?.("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setSubmitting(true);
    try {
      await onFile(f);
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePaste() {
    const text = pasted.trim();
    if (!text) return;
    const looksJson = text.startsWith("{") || text.startsWith("[");
    const filename = looksJson ? "colado.json" : "colado.md";
    const file = new File([text], filename, {
      type: looksJson ? "application/json" : "text/markdown",
    });
    setSubmitting(true);
    try {
      await onFile(file);
      setPasted("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur grid place-items-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border/60 bg-card shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-border/60 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> {title}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Cole o prompt em qualquer IA (ChatGPT, Claude, Gemini…), gere o mapa e
              cole o resultado abaixo — ou importe um arquivo <code className="font-mono">.md</code> / <code className="font-mono">.json</code>.
            </p>
          </div>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-md hover:bg-muted text-muted-foreground"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-auto">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-foreground/80 uppercase tracking-wider">
                1. Prompt para a IA
              </label>
              <Button size="sm" variant="secondary" onClick={copyPrompt} className="gap-2 h-8">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copiado" : "Copiar prompt"}
              </Button>
            </div>
            <textarea
              id="ai-import-prompt-ta"
              readOnly
              value={AI_IMPORT_PROMPT}
              className="w-full h-40 rounded-md border border-border/60 bg-muted/40 p-3 text-xs font-mono text-foreground/90 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground/80 uppercase tracking-wider mb-2 block">
              2. Cole aqui o resultado da IA
            </label>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={"# Tema principal\n## Primeiro ramo\n- Ideia 1\n  - Detalhe"}
              className="w-full h-40 rounded-md border border-border/60 bg-background p-3 text-xs font-mono text-foreground/90 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="flex items-center justify-between mt-2 gap-2">
              <p className="text-[11px] text-muted-foreground">
                Aceita Markdown (títulos + listas) ou JSON hierárquico.
              </p>
              <Button
                size="sm"
                onClick={handlePaste}
                disabled={!pasted.trim() || submitting}
                className="gap-2"
              >
                <Sparkles className="size-3.5" /> Importar texto colado
              </Button>
            </div>
          </div>

          {warning && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {warning}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border/60 flex items-center justify-between gap-3 bg-muted/20">
          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,.json,.txt,text/markdown,application/json,text/plain"
            className="hidden"
            onChange={handleChange}
          />
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm rounded-md hover:bg-muted text-muted-foreground"
          >
            Cancelar
          </button>
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={submitting}
            className="gap-2"
          >
            <Upload className="size-4" /> Ou escolher arquivo
          </Button>
        </div>
      </div>
    </div>
  );
}
