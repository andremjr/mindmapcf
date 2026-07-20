import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Network, Trash2, Clock, LogOut } from "lucide-react";
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
import { useStore } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Project } from "@/lib/types";
import { resolveImage } from "@/lib/imageStorage";

function ProjectThumb({ project }: { project: Project }) {
  const root = project.nodes.find((n) => !n.parentId) ?? project.nodes[0];
  const legacy = root?.image;
  const ref = root?.imageRef;
  const refKind = ref?.kind ?? "image";
  const [url, setUrl] = useState<string | null>(legacy ?? null);

  useEffect(() => {
    if (legacy) {
      setUrl(legacy);
      return;
    }
    if (!ref || refKind !== "image") {
      setUrl(null);
      return;
    }
    let alive = true;
    resolveImage(ref).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [legacy, ref, refKind]);


  if (url) {
    return (
      <div className="aspect-video rounded-md mb-4 relative overflow-hidden border border-border/50 bg-muted">
        <img
          src={url}
          alt=""
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
        <div className="absolute bottom-2 right-2 text-[10px] font-mono text-foreground/90 bg-background/70 px-2 py-0.5 rounded">
          {project.nodes.length} {project.nodes.length === 1 ? "nó" : "nós"}
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-video rounded-md bg-gradient-to-br from-muted to-background mb-4 relative overflow-hidden border border-border/50 grid place-items-center">
      <Network className="size-8 text-foreground/20" />
      <div className="absolute bottom-2 right-2 text-[10px] font-mono text-muted-foreground bg-background/70 px-2 py-0.5 rounded">
        {project.nodes.length} {project.nodes.length === 1 ? "nó" : "nós"}
      </div>
    </div>
  );
}



export const Route = createFileRoute("/projects/")({
  head: () => ({
    meta: [
      { title: "Mapas mentais — Canvas Narrativo" },
      { name: "description", content: "Crie mapas mentais manuais e apresente com movimento de câmera." },
    ],
  }),
  component: ProjectsDashboard,
});

function ProjectsDashboard() {
  const projects = useStore((s) => s.projects);
  const createProject = useStore((s) => s.createProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const navigate = useNavigate();
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  // Auth gate + Supabase sync are owned by the /projects layout route.
  if (!session) return null;



  function handleCreate() {
    const id = createProject(title);
    setOpen(false);
    setTitle("");
    navigate({ to: "/projects/$id", params: { id } });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 backdrop-blur-md bg-background/70 sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center shadow-lg">
              <Network className="size-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold">Canvas Narrativo</h1>
              <p className="text-xs text-muted-foreground">Mapas mentais com modo apresentação</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {session.user.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth", replace: true });
              }}
              className="gap-2"
            >
              <LogOut className="size-4" /> Sair
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="size-4" /> Novo mapa
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar mapa mental</DialogTitle>
                </DialogHeader>
                <Input
                  autoFocus
                  placeholder="Nome do mapa"
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

        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold">Seus mapas</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {projects.length} {projects.length === 1 ? "mapa" : "mapas"}
          </p>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-xl border border-border/60 bg-card p-16 text-center">
            <Network className="size-10 mx-auto text-muted-foreground/60 mb-3" />
            <p className="text-muted-foreground">Nenhum mapa ainda. Crie o primeiro.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((p) => (
              <div key={p.id} className="rounded-xl border border-border/60 bg-card group relative overflow-hidden hover:border-primary/50 transition">
                <Link to="/projects/$id" params={{ id: p.id }} className="block p-5">
                  <ProjectThumb project={p} />
                  <h3 className="text-base font-semibold truncate">{p.title}</h3>
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {new Date(p.updatedAt).toLocaleDateString("pt-BR")}
                  </div>
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    if (confirm(`Excluir "${p.title}"?`)) deleteProject(p.id);
                  }}
                  className="absolute top-3 right-3 size-8 grid place-items-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition"
                  aria-label="Excluir mapa"
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
