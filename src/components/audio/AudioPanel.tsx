import { useRef, useState } from "react";
import { Upload, Trash2, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import type { Project, AudioFile } from "@/lib/types";
import { AssemblyConfig } from "./AssemblyConfig";

const ACCEPT = ".mp3,.wav,.m4a,.mp4,audio/*,video/mp4";

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}
function fmtDur(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function AudioPanel({ project }: { project: Project }) {
  const setAudio = useStore((s) => s.setAudio);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFile(file: File) {
    const url = URL.createObjectURL(file);
    const audioEl = document.createElement("audio");
    audioEl.src = url;
    audioEl.addEventListener("loadedmetadata", () => {
      const af: AudioFile = {
        id: `aud_${Date.now()}`,
        name: file.name,
        sizeBytes: file.size,
        durationSec: Math.round(audioEl.duration),
        mimeType: file.type || "audio/mpeg",
        objectUrl: url,
      };
      setAudio(project.id, af);
    });
  }

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <div>
        <h2 className="text-display text-xl">Áudio</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Carregue um arquivo MP3, WAV, M4A ou MP4 para começar.
        </p>
      </div>

      {!project.audio ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          onClick={() => inputRef.current?.click()}
          className={`surface-card cursor-pointer border-dashed transition p-16 text-center ${dragging ? "glow-ring border-primary" : ""}`}
        >
          <Upload className="size-10 mx-auto text-muted-foreground/60 mb-3" />
          <p className="text-sm">
            <span className="text-foreground font-medium">Clique para selecionar</span>
            <span className="text-muted-foreground"> ou arraste o arquivo aqui</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2">MP3, WAV, M4A, MP4 — até ~50MB</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      ) : (
        <div className="surface-card p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="size-12 rounded-md bg-primary/15 text-primary grid place-items-center">
              <Music className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-display text-sm truncate">{project.audio.name}</div>
              <div className="text-xs text-muted-foreground text-mono mt-0.5">
                {fmtDur(project.audio.durationSec)} · {fmtSize(project.audio.sizeBytes)} · {project.audio.mimeType}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAudio(project.id, undefined)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4 mr-1" /> Remover
            </Button>
          </div>
          {project.audio.objectUrl && (
            <audio controls src={project.audio.objectUrl} className="w-full" />
          )}
        </div>
      )}

      {project.audio && <AssemblyConfig project={project} />}
    </div>
  );
}
