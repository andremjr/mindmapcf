import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Network,
  Trash2,
  Clock,
  LogOut,
  Upload,
  Crown,
  Mic,
  Folder as FolderIcon,
  FolderPlus,
  Inbox,
  Pencil,
  Check,
  X,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
} from "lucide-react";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Project } from "@/lib/types";
import { resolveImage } from "@/lib/imageStorage";
import { importFromText, buildImportedProject } from "@/lib/mindmapImport";
import { ImportDialog } from "@/components/mindmap/ImportDialog";
import { toast } from "sonner";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { SonicAvatarDialog } from "@/components/mindmap/SonicAvatarDialog";
import { useTheme } from "@/hooks/useTheme";


const FREE_MAP_LIMIT = 3;
const FREE_NODE_LIMIT = 30;
const ALL_FOLDERS = "__all__";
const NO_FOLDER = "__none__";

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
  const folders = useStore((s) => s.folders);
  const createProject = useStore((s) => s.createProject);
  const importProject = useStore((s) => s.importProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const moveProjectToFolder = useStore((s) => s.moveProjectToFolder);
  const createFolder = useStore((s) => s.createFolder);
  const renameFolder = useStore((s) => s.renameFolder);
  const deleteFolder = useStore((s) => s.deleteFolder);
  const navigate = useNavigate();
  const { session } = useAuth();
  const { isPro, loading: subscriptionLoading, subscription } = useSubscription(session?.user.id);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [avatarsOpen, setAvatarsOpen] = useState(false);
  const [activeFolder, setActiveFolder] = useState<string>(ALL_FOLDERS);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [folders],
  );

  const visibleProjects = useMemo(() => {
    if (activeFolder === ALL_FOLDERS) return projects;
    if (activeFolder === NO_FOLDER) return projects.filter((p) => !p.folderId);
    return projects.filter((p) => p.folderId === activeFolder);
  }, [projects, activeFolder]);

  const countByFolder = useMemo(() => {
    const map = new Map<string, number>();
    let none = 0;
    for (const p of projects) {
      if (p.folderId) map.set(p.folderId, (map.get(p.folderId) ?? 0) + 1);
      else none += 1;
    }
    return { map, none };
  }, [projects]);

  // Auth gate + Supabase sync are owned by the /projects layout route.
  if (!session) return null;

  const activeFolderLabel =
    activeFolder === ALL_FOLDERS
      ? "Todos os mapas"
      : activeFolder === NO_FOLDER
      ? "Sem pasta"
      : sortedFolders.find((f) => f.id === activeFolder)?.name ?? "Pasta";

  function handleCreate() {
    if (!isPro && projects.length >= FREE_MAP_LIMIT) {
      setOpen(false);
      setUpgradeOpen(true);
      toast.error("O plano grátis permite até 3 mapas mentais.");
      return;
    }
    const folderId =
      activeFolder === ALL_FOLDERS || activeFolder === NO_FOLDER ? null : activeFolder;
    const id = createProject(title, folderId);
    setOpen(false);
    setTitle("");
    navigate({ to: "/projects/$id", params: { id } });
  }

  function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const id = createFolder(name);
    setNewFolderName("");
    setNewFolderOpen(false);
    setActiveFolder(id);
    toast.success(`Pasta "${name}" criada.`);
  }

  function commitRename(id: string) {
    const name = editingName.trim();
    if (name) renameFolder(id, name);
    setEditingFolder(null);
    setEditingName("");
  }

  function handleDeleteFolder(id: string, name: string) {
    const count = countByFolder.map.get(id) ?? 0;
    const msg =
      count > 0
        ? `Excluir a pasta "${name}"? Os ${count} ${count === 1 ? "mapa" : "mapas"} dentro dela voltam para "Sem pasta".`
        : `Excluir a pasta "${name}"?`;
    if (!confirm(msg)) return;
    deleteFolder(id);
    if (activeFolder === id) setActiveFolder(ALL_FOLDERS);
  }

  async function handleImportFile(file: File) {
    try {
      const text = await file.text();
      const imported = importFromText(text, file.name);
      if (imported.nodes.length === 0) {
        toast.error("Arquivo vazio ou não reconhecido.");
        return;
      }
      if (!isPro && projects.length >= FREE_MAP_LIMIT) {
        setImportOpen(false);
        setUpgradeOpen(true);
        toast.error("O plano grátis permite até 3 mapas mentais.");
        return;
      }
      if (!isPro && imported.nodes.length > FREE_NODE_LIMIT) {
        setImportOpen(false);
        setUpgradeOpen(true);
        toast.error("O plano grátis permite importar mapas com até 30 nós.");
        return;
      }
      const base = file.name.replace(/\.[^.]+$/, "");
      const folderId =
        activeFolder === ALL_FOLDERS || activeFolder === NO_FOLDER ? null : activeFolder;
      const project = buildImportedProject({
        ...imported,
        title: imported.title && imported.title !== "Mapa importado" ? imported.title : base,
      });
      const id = importProject({ ...project, folderId });
      setImportOpen(false);
      toast.success(`Mapa importado com ${imported.nodes.length} nós.`);
      navigate({ to: "/projects/$id", params: { id } });
    } catch (err) {
      console.error(err);
      toast.error("Falha ao importar. Verifique o arquivo .md ou .json.");
    }
  }

  const sidebarItemBase =
    "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition group/item";
  const sidebarItemInactive = "text-muted-foreground hover:bg-muted/60 hover:text-foreground";
  const sidebarItemActive = "bg-primary/15 text-foreground border border-primary/30";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 backdrop-blur-md bg-background/70 sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/favicon.png" alt="Canvas Narrativo" className="size-9 rounded-lg shadow-lg" />
            <div>
              <h1 className="text-base font-semibold">Canvas Narrativo</h1>
              <p className="text-xs text-muted-foreground">Mapas mentais com modo apresentação</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPro ? (
              <Button asChild variant="secondary" size="sm" className="gap-1">
                <Link to="/account"><Crown className="size-3.5" /> Minha conta</Link>
              </Button>
            ) : (
              <>
                <span className="rounded-full border border-border/60 px-2 py-1 text-xs text-muted-foreground hidden md:inline-flex">
                  {subscriptionLoading ? "Plano…" : `Grátis ${projects.length}/${FREE_MAP_LIMIT}`}
                </span>
                {!subscriptionLoading && (
                  <Button variant="secondary" size="sm" onClick={() => navigate({ to: "/pricing" })}>
                    Plano Pro
                  </Button>
                )}
              </>
            )}
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
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setAvatarsOpen(true)}
              title="Avatares sonoros (Pro)"
            >
              <Mic className="size-4" /> Avatares
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="size-4" /> Importar
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" disabled={!isPro && projects.length >= FREE_MAP_LIMIT}>
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
                {activeFolder !== ALL_FOLDERS && activeFolder !== NO_FOLDER && (
                  <p className="text-xs text-muted-foreground">
                    Será criado na pasta <span className="text-foreground font-medium">{activeFolderLabel}</span>.
                  </p>
                )}
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={handleCreate}>Criar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

          </div>

        </div>
      </header>

      {subscription?.status === "past_due" && (
        <div className="border-b border-orange-500/40 bg-orange-500/10 px-6 py-3 text-center text-sm text-orange-200">
          Pagamento pendente na sua assinatura.{" "}
          <Link to="/account" className="underline font-medium">Atualizar cartão</Link>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-6 py-10 grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8">
        <aside className="space-y-1">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Pastas
            </span>
            <button
              onClick={() => setNewFolderOpen(true)}
              className="size-6 grid place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition"
              aria-label="Nova pasta"
              title="Nova pasta"
            >
              <FolderPlus className="size-4" />
            </button>
          </div>

          <button
            onClick={() => setActiveFolder(ALL_FOLDERS)}
            className={`${sidebarItemBase} ${activeFolder === ALL_FOLDERS ? sidebarItemActive : sidebarItemInactive}`}
          >
            <Network className="size-4 shrink-0" />
            <span className="flex-1 truncate">Todos os mapas</span>
            <span className="text-xs text-muted-foreground">{projects.length}</span>
          </button>

          <button
            onClick={() => setActiveFolder(NO_FOLDER)}
            className={`${sidebarItemBase} ${activeFolder === NO_FOLDER ? sidebarItemActive : sidebarItemInactive}`}
          >
            <Inbox className="size-4 shrink-0" />
            <span className="flex-1 truncate">Sem pasta</span>
            <span className="text-xs text-muted-foreground">{countByFolder.none}</span>
          </button>

          {sortedFolders.length > 0 && <div className="my-2 border-t border-border/50" />}

          {sortedFolders.map((f) => {
            const isActive = activeFolder === f.id;
            const isEditing = editingFolder === f.id;
            return (
              <div
                key={f.id}
                className={`${sidebarItemBase} ${isActive ? sidebarItemActive : sidebarItemInactive} pr-1`}
              >
                <FolderIcon className="size-4 shrink-0" />
                {isEditing ? (
                  <>
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(f.id);
                        if (e.key === "Escape") {
                          setEditingFolder(null);
                          setEditingName("");
                        }
                      }}
                      className="flex-1 bg-transparent outline-none text-sm min-w-0"
                    />
                    <button
                      onClick={() => commitRename(f.id)}
                      className="size-6 grid place-items-center rounded hover:bg-muted"
                      aria-label="Confirmar"
                    >
                      <Check className="size-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingFolder(null);
                        setEditingName("");
                      }}
                      className="size-6 grid place-items-center rounded hover:bg-muted"
                      aria-label="Cancelar"
                    >
                      <X className="size-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setActiveFolder(f.id)}
                      className="flex-1 truncate text-left"
                    >
                      {f.name}
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {countByFolder.map.get(f.id) ?? 0}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="size-6 grid place-items-center rounded opacity-0 group-hover/item:opacity-100 hover:bg-muted transition"
                          aria-label="Opções da pasta"
                        >
                          <MoreVertical className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingFolder(f.id);
                            setEditingName(f.name);
                          }}
                        >
                          <Pencil className="size-3.5 mr-2" /> Renomear
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDeleteFolder(f.id, f.name)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-3.5 mr-2" /> Excluir pasta
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            );
          })}
        </aside>

        <section>
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">{activeFolderLabel}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {visibleProjects.length} {visibleProjects.length === 1 ? "mapa" : "mapas"}
              </p>
            </div>
          </div>

          {visibleProjects.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-card p-16 text-center">
              <Network className="size-10 mx-auto text-muted-foreground/60 mb-3" />
              <p className="text-muted-foreground">
                {activeFolder === ALL_FOLDERS
                  ? "Nenhum mapa ainda. Crie o primeiro."
                  : "Nenhum mapa nesta pasta ainda."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {visibleProjects.map((p) => (
                <div key={p.id} className="rounded-xl border border-border/60 bg-card group relative overflow-hidden hover:border-primary/50 transition">
                  <Link to="/projects/$id" params={{ id: p.id }} className="block p-5">
                    <ProjectThumb project={p} />
                    <h3 className="text-base font-semibold truncate">{p.title}</h3>
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      {new Date(p.updatedAt).toLocaleDateString("pt-BR")}
                      {p.folderId && (
                        <>
                          <span className="mx-1">·</span>
                          <FolderIcon className="size-3" />
                          <span className="truncate">
                            {sortedFolders.find((f) => f.id === p.folderId)?.name ?? "Pasta"}
                          </span>
                        </>
                      )}
                    </div>
                  </Link>
                  <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="size-8 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition"
                          aria-label="Mover para pasta"
                          title="Mover para pasta"
                          onClick={(e) => e.preventDefault()}
                        >
                          <FolderIcon className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem
                          onClick={() => moveProjectToFolder(p.id, null)}
                          disabled={!p.folderId}
                        >
                          <Inbox className="size-3.5 mr-2" /> Sem pasta
                        </DropdownMenuItem>
                        {sortedFolders.length > 0 && <DropdownMenuSeparator />}
                        {sortedFolders.map((f) => (
                          <DropdownMenuItem
                            key={f.id}
                            onClick={() => moveProjectToFolder(p.id, f.id)}
                            disabled={p.folderId === f.id}
                          >
                            <FolderIcon className="size-3.5 mr-2" /> {f.name}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => {
                            const name = prompt("Nome da nova pasta:");
                            if (!name?.trim()) return;
                            const id = createFolder(name.trim());
                            moveProjectToFolder(p.id, id);
                            toast.success(`Movido para "${name.trim()}".`);
                          }}
                        >
                          <FolderPlus className="size-3.5 mr-2" /> Nova pasta…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        if (confirm(`Excluir "${p.title}"?`)) deleteProject(p.id);
                      }}
                      className="size-8 grid place-items-center rounded-md text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition"
                      aria-label="Excluir mapa"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova pasta</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Nome da pasta (ex: Canal Documentários)"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewFolderOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateFolder}>Criar pasta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onFile={handleImportFile}
      />
      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        user={session.user}
      />
      <SonicAvatarDialog
        userId={session.user.id}
        isPro={isPro}
        open={avatarsOpen}
        onClose={() => setAvatarsOpen(false)}
        onUpgrade={() => setUpgradeOpen(true)}
      />

    </div>
  );
}
