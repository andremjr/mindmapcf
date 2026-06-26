import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Film, Trash2, Clock, Mic, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/types";

export const Route = createFileRoute("/projects")({
  head: () => ({
    meta: [
      { title: "Projetos — Canvas Narrativo" },
      { name: "description", content: "Seus projetos de áudio em vídeo cinematográfico." },
    ],
  }),
  component: ProjectsDashboard,
});

const STATUS_COLOR: Record<ProjectStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  audio_uploaded: "bg-primary/15 text-primary",
  transcribed: "bg-primary/20 text-primary",
  blocks_generated: "bg-accent/20 text-accent",
  canvas_generated: "bg-accent/25 text-accent",
  ready_to_render: "bg-chart-3/20 text-chart-3",
  exported: "bg-chart-4/20 text-chart-4",
};

function fmtDur(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function ProjectsDashboard() {
  const projects = useStore((s) => s.projects);
  const createProject = useStore((s) => s.createProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  function handleCreate() {
    const id = createProject(title);
    setOpen(false);
    setTitle("");
    navigate({ to: "/projects/$id", params: { id } });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 backdrop-blur-md bg-background/70 sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center shadow-lg">
              <Film className="size-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-display text-base">Canvas Narrativo</h1>
              <p className="text-xs text-muted-foreground">Áudio → vídeo cinematográfico</p>
            </div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" /> Novo projeto
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar projeto</DialogTitle>
              </DialogHeader>
              <Input
                autoFocus
                placeholder="Nome do projeto"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate}>Criar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-display text-2xl">Seus projetos</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {projects.length} {projects.length === 1 ? "projeto" : "projetos"}
            </p>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="surface-card p-16 text-center">
            <Film className="size-10 mx-auto text-muted-foreground/60 mb-3" />
            <p className="text-muted-foreground">Nenhum projeto ainda. Crie o primeiro.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((p) => (
              <div key={p.id} className="surface-card group relative overflow-hidden transition-all hover:glow-ring">
                <Link to="/projects/$id" params={{ id: p.id }} className="block p-5">
                  <div className="aspect-video rounded-md bg-gradient-to-br from-surface-2 to-surface mb-4 relative overflow-hidden border border-border/50">
                    <div className="absolute inset-0 grid place-items-center">
                      <span className="text-display text-2xl text-foreground/30 select-none">
                        {p.blocks[0]?.shortText ?? "Sem conteúdo"}
                      </span>
                    </div>
                    <div className="absolute bottom-2 right-2 text-mono text-[10px] text-muted-foreground bg-background/70 px-2 py-0.5 rounded">
                      {fmtDur(p.durationSec)}
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-display text-base truncate">{p.title}</h3>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Mic className="size-3" />{p.blocks.length} blocos</span>
                        <span className="flex items-center gap-1"><Clock className="size-3" />{new Date(p.updatedAt).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                  </div>
                  <Badge className={`mt-3 ${STATUS_COLOR[p.status]} border-0`}>
                    {PROJECT_STATUS_LABEL[p.status]}
                  </Badge>
                </Link>
                <button
                  onClick={(e) => { e.preventDefault(); if (confirm(`Excluir "${p.title}"?`)) deleteProject(p.id); }}
                  className="absolute top-3 right-3 size-8 grid place-items-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition"
                  aria-label="Excluir projeto"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
