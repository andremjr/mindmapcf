import { useEffect, useState } from "react";
import { ShieldAlert, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import type { Project } from "@/lib/types";
import {
  loadApiKey,
  saveApiKey,
  transcribeAudio,
} from "@/lib/assemblyService";

export function AssemblyConfig({ project }: { project: Project }) {
  const [apiKey, setApiKey] = useState("");
  const [language, setLanguage] = useState("pt-BR");
  const [wordTimestamps, setWordTimestamps] = useState(true);
  const [punctuate, setPunctuate] = useState(true);

  const setTranscript = useStore((s) => s.setTranscript);
  const transcribing = useStore((s) => s.transcribing);
  const setTranscribing = useStore((s) => s.setTranscribing);
  const setTranscribeError = useStore((s) => s.setTranscribeError);

  useEffect(() => {
    setApiKey(loadApiKey());
  }, []);

  function handleKeyChange(v: string) {
    setApiKey(v);
    saveApiKey(v);
  }

  async function handleTranscribe() {
    if (!project.audio) return;
    setTranscribing(true);
    setTranscribeError(null);
    try {
      const transcript = await transcribeAudio(project.audio, {
        apiKey,
        language,
        wordTimestamps,
        punctuate,
      });
      setTranscript(project.id, transcript);
      toast.success("Transcrição concluída", {
        description: `${transcript.words.length} palavras em ${language}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTranscribeError(msg);
      toast.error("Erro na transcrição", { description: msg });
    } finally {
      setTranscribing(false);
    }
  }

  return (
    <div className="surface-card p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h3 className="text-display text-sm">AssemblyAI</h3>
        <span className="text-[10px] text-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
          {apiKey ? "REAL" : "MOCK"}
        </span>
      </div>

      <div className="rounded-md border border-chart-4/30 bg-chart-4/5 p-3 flex gap-3 text-xs">
        <ShieldAlert className="size-4 text-chart-4 shrink-0 mt-0.5" />
        <div className="text-muted-foreground">
          A API key fica apenas no <code className="text-mono text-foreground">sessionStorage</code> deste
          navegador. Em produção, mova a chamada para uma edge function para não expor a chave.
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="ak">API Key</Label>
          <Input
            id="ak"
            type="password"
            placeholder="aai_..."
            value={apiKey}
            onChange={(e) => handleKeyChange(e.target.value)}
            className="text-mono"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Idioma</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pt-BR">Português (BR)</SelectItem>
              <SelectItem value="pt">Português (PT)</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Español</SelectItem>
              <SelectItem value="fr">Français</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3 pt-6">
          <div className="flex items-center justify-between">
            <Label htmlFor="wt" className="text-xs">Word-level timestamps</Label>
            <Switch id="wt" checked={wordTimestamps} onCheckedChange={setWordTimestamps} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="pn" className="text-xs">Pontuação e formatação</Label>
            <Switch id="pn" checked={punctuate} onCheckedChange={setPunctuate} />
          </div>
        </div>
      </div>

      <Button
        onClick={handleTranscribe}
        disabled={transcribing || !project.audio}
        className="w-full"
      >
        {transcribing ? (
          <><Loader2 className="size-4 mr-2 animate-spin" /> Transcrevendo…</>
        ) : (
          <>Transcrever áudio</>
        )}
      </Button>
    </div>
  );
}
