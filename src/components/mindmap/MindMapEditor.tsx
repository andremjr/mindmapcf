import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft,
  Plus,
  Play,
  Maximize,
  LayoutGrid,
  Trash2,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MindNode, Project } from "@/lib/types";
import { useStore, descendantIds } from "@/lib/store";
import { MindMapCanvas } from "./MindMapCanvas";
import { NodeCard } from "./NodeCard";

import { pickMediaAndStore } from "@/lib/imageStorage";
import { startRecording } from "@/lib/screenRecorder";



export function MindMapEditor({ project }: { project: Project }) {
  const addNode = useStore((s) => s.addNode);
  const updateNode = useStore((s) => s.updateNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const setParent = useStore((s) => s.setParent);
  const toggleCollapsed = useStore((s) => s.toggleCollapsed);
  const runAutoLayout = useStore((s) => s.autoLayout);
  const renameProject = useStore((s) => s.renameProject);
  const setViewportPersist = useStore((s) => s.setViewport);
  const navigate = useNavigate();

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [viewport, setViewport] = useState(project.viewport ?? { x: 0, y: 0, zoom: 1 });
  const [selectedId, setSelectedId] = useState<string | undefined>(project.nodes[0]?.id);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [pendingEdge, setPendingEdge] = useState<
    | { fromId: string; toX: number; toY: number; overNodeId?: string }
    | null
  >(null);
  const [dropTargetId, setDropTargetId] = useState<string | undefined>();

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      const r = containerRef.current!.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setViewportPersist(project.id, viewport), 400);
    return () => clearTimeout(t);
  }, [viewport, project.id, setViewportPersist]);

  // --- Coordinate helpers ---
  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const rect = containerRef.current!.getBoundingClientRect();
      const mx = sx - rect.left - rect.width / 2;
      const my = sy - rect.top - rect.height / 2;
      return { x: viewport.x + mx / viewport.zoom, y: viewport.y + my / viewport.zoom };
    },
    [viewport],
  );

  // --- Visible node set (respect collapsed) ---
  const visibleIds = useMemo(() => {
    const hidden = new Set<string>();
    for (const n of project.nodes) {
      if (n.collapsed) {
        for (const d of descendantIds(project.nodes, n.id)) hidden.add(d);
      }
    }
    return new Set(project.nodes.map((n) => n.id).filter((id) => !hidden.has(id)));
  }, [project.nodes]);

  const childCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of project.nodes) {
      if (n.parentId) m.set(n.parentId, (m.get(n.parentId) ?? 0) + 1);
    }
    return m;
  }, [project.nodes]);

  // --- Pan background ---
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  function onBgPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    setSelectedId(undefined);
    if (e.button !== 0 && e.button !== 1) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    panRef.current = { sx: e.clientX, sy: e.clientY, vx: viewport.x, vy: viewport.y };
  }
  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!panRef.current) return;
      const dx = (e.clientX - panRef.current.sx) / viewport.zoom;
      const dy = (e.clientY - panRef.current.sy) / viewport.zoom;
      setViewport((v) => ({ ...v, x: panRef.current!.vx - dx, y: panRef.current!.vy - dy }));
    }
    function onUp() {
      panRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [viewport.zoom]);

  // --- Zoom ---
  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaX) < 2 && e.deltaMode === 0) {
      // Normal wheel: still zoom (mind-map convention)
    }
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    const newZoom = Math.max(0.2, Math.min(2.5, viewport.zoom * (1 + delta)));
    const rect = containerRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left - rect.width / 2;
    const my = e.clientY - rect.top - rect.height / 2;
    const worldX = viewport.x + mx / viewport.zoom;
    const worldY = viewport.y + my / viewport.zoom;
    const nx = worldX - mx / newZoom;
    const ny = worldY - my / newZoom;
    setViewport({ x: nx, y: ny, zoom: newZoom });
  }

  // --- Node dragging (move + optional re-parent on drop) ---
  const dragRef = useRef<
    | {
        id: string;
        sx: number;
        sy: number;
        nx: number;
        ny: number;
        moved: boolean;
      }
    | null
  >(null);

  function findNodeAt(clientX: number, clientY: number, ignoreId?: string): string | undefined {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const nodeEl = el?.closest("[data-node-id]") as HTMLElement | null;
    const id = nodeEl?.dataset.nodeId;
    if (!id || id === ignoreId) return undefined;
    return id;
  }

  function onNodeDragStart(node: MindNode, e: React.PointerEvent) {
    if (editingId === node.id) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      id: node.id,
      sx: e.clientX,
      sy: e.clientY,
      nx: node.x,
      ny: node.y,
      moved: false,
    };
  }
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.sx) / viewport.zoom;
      const dy = (e.clientY - d.sy) / viewport.zoom;
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      d.moved = true;
      updateNode(project.id, d.id, { x: d.nx + dx, y: d.ny + dy });
      // Alt held → highlight target for re-parenting
      if (e.altKey) {
        const desc = new Set([d.id, ...descendantIds(project.nodes, d.id)]);
        const overId = findNodeAt(e.clientX, e.clientY, d.id);
        setDropTargetId(overId && !desc.has(overId) ? overId : undefined);
      } else {
        setDropTargetId(undefined);
      }
    }
    function onUp(e: PointerEvent) {
      const d = dragRef.current;
      dragRef.current = null;
      if (d && d.moved && e.altKey) {
        const desc = new Set([d.id, ...descendantIds(project.nodes, d.id)]);
        const overId = findNodeAt(e.clientX, e.clientY, d.id);
        if (overId && !desc.has(overId)) {
          setParent(project.id, d.id, overId);
        }
      }
      setDropTargetId(undefined);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [viewport.zoom, project.id, project.nodes, updateNode, setParent]);

  // --- Connect gesture (drag from handle) ---
  useEffect(() => {
    if (!pendingEdge) return;
    function onMove(e: PointerEvent) {
      const w = screenToWorld(e.clientX, e.clientY);
      const overId = findNodeAt(e.clientX, e.clientY, pendingEdge!.fromId);
      setPendingEdge((p) => (p ? { ...p, toX: w.x, toY: w.y, overNodeId: overId } : p));
    }
    function onUp(e: PointerEvent) {
      const from = pendingEdge!.fromId;
      const overId = findNodeAt(e.clientX, e.clientY, from);
      if (overId) {
        // Reparent overId under `from` (unless it would cycle)
        setParent(project.id, overId, from);
      } else {
        // Create new child at drop position
        const w = screenToWorld(e.clientX, e.clientY);
        const id = addNode(project.id, { parentId: from, x: w.x, y: w.y });
        setSelectedId(id);
        setEditingId(id);
      }
      setPendingEdge(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [pendingEdge, project.id, screenToWorld, setParent, addNode]);

  function startConnect(node: MindNode, e: React.PointerEvent) {
    setSelectedId(node.id);
    const w = screenToWorld(e.clientX, e.clientY);
    setPendingEdge({ fromId: node.id, toX: w.x, toY: w.y });
  }

  // --- Keyboard shortcuts ---
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;

      if (!selectedId) return;

      if (e.key === "Tab") {
        e.preventDefault();
        const id = addNode(project.id, { parentId: selectedId });
        setSelectedId(id);
        setEditingId(id);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const sel = project.nodes.find((n) => n.id === selectedId);
        if (!sel) return;
        if (!sel.parentId) {
          // Root: Enter adds a child instead of a sibling.
          const id = addNode(project.id, { parentId: sel.id });
          setSelectedId(id);
          setEditingId(id);
        } else {
          const id = addNode(project.id, { parentId: sel.parentId });
          setSelectedId(id);
          setEditingId(id);
        }
      } else if (e.key === "F2") {
        e.preventDefault();
        setEditingId(selectedId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const sel = project.nodes.find((n) => n.id === selectedId);
        if (!sel) return;
        deleteNode(project.id, selectedId);
        setSelectedId(sel.parentId ?? project.nodes[0]?.id);
      } else if (e.key === " ") {
        e.preventDefault();
        toggleCollapsed(project.id, selectedId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, project.id, project.nodes, addNode, deleteNode, toggleCollapsed]);

  function handleAdd() {
    // Add a child of selected, or a new root if none selected.
    const parentId = selectedId ?? null;
    const id = addNode(project.id, { parentId });
    setSelectedId(id);
    setEditingId(id);
  }

  function handlePresent() {
    setViewportPersist(project.id, viewport);
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    navigate({ to: "/projects/$id/present", params: { id: project.id } });
  }

  async function handleRecordAndPresent() {
    setViewportPersist(project.id, viewport);
    const ok = confirm(
      "Ao clicar em OK, o navegador vai pedir permissão para capturar a tela.\n\n" +
        "• Escolha a aba/janela desta apresentação.\n" +
        "• Marque \"Compartilhar áudio da guia\" para gravar o som dos vídeos.\n" +
        "• Você também vai autorizar o microfone para narrar por cima.\n\n" +
        "Aperte R (ou o botão Parar) para finalizar. O arquivo é baixado automaticamente.",
    );
    if (!ok) return;
    try {
      await startRecording({ filenameBase: project.title || "apresentacao" });
    } catch (e: any) {
      console.error("[mindmap] recording start", e);
      if (e?.name !== "NotAllowedError") {
        alert(e?.message || "Não foi possível iniciar a gravação.");
      }
      return;
    }
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    navigate({
      to: "/projects/$id/present",
      params: { id: project.id },
      search: { record: "1" },
    });
  }


  function fitAll() {
    const visibleNodes = project.nodes.filter((n) => visibleIds.has(n.id));
    if (visibleNodes.length === 0) {
      setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const n of visibleNodes) {
      const w = n.width ?? 260;
      minX = Math.min(minX, n.x - w / 2);
      maxX = Math.max(maxX, n.x + w / 2);
      minY = Math.min(minY, n.y - 100);
      maxY = Math.max(maxY, n.y + 100);
    }
    const bw = maxX - minX + 240;
    const bh = maxY - minY + 240;
    const zoom = Math.min(size.w / bw, size.h / bh, 1.2);
    setViewport({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom });
  }

  function handleBgDoubleClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    const w = screenToWorld(e.clientX, e.clientY);
    const id = addNode(project.id, { parentId: null, x: w.x, y: w.y });
    setSelectedId(id);
    setEditingId(id);
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="h-14 border-b border-border/60 flex items-center px-4 gap-4 bg-background/60 backdrop-blur">
        <Link to="/projects" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          <span>Mapas</span>
        </Link>
        <div className="h-6 w-px bg-border" />
        <input
          value={project.title}
          onChange={(e) => renameProject(project.id, e.target.value)}
          className="bg-transparent outline-none font-semibold text-sm min-w-0 flex-1 max-w-md"
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => runAutoLayout(project.id)}
            className="gap-2"
            title="Organizar horizontalmente"
          >
            <LayoutGrid className="size-4" /> Organizar
          </Button>
          <Button variant="ghost" size="sm" onClick={fitAll} className="gap-2">
            <Maximize className="size-4" /> Ver tudo
          </Button>
          <Button variant="secondary" size="sm" onClick={handleAdd} className="gap-2">
            <Plus className="size-4" /> Nó
          </Button>
          <Button size="sm" onClick={handlePresent} className="gap-2" disabled={project.nodes.length === 0}>
            <Play className="size-4" /> Apresentar
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <main className="relative flex-1 min-w-0">
          <div ref={containerRef} className="absolute inset-0">
            <MindMapCanvas
              nodes={project.nodes}
              visibleIds={visibleIds}
              viewport={viewport}
              containerSize={size}
              pendingEdge={pendingEdge}
              onBackgroundPointerDown={onBgPointerDown}
              onWheel={onWheel}
              onBackgroundDoubleClick={handleBgDoubleClick}
            >
              {project.nodes.map((n) => {
                if (!visibleIds.has(n.id)) return null;
                const isDropTarget = dropTargetId === n.id;
                return (
                  <div
                    key={n.id}
                    style={{
                      outline: isDropTarget
                        ? "2px solid color-mix(in oklch, var(--primary) 80%, transparent)"
                        : undefined,
                      outlineOffset: 4,
                      borderRadius: 12,
                    }}
                  >
                    <NodeCard
                      node={n}
                      childCount={childCounts.get(n.id) ?? 0}
                      selected={selectedId === n.id}
                      editing={editingId === n.id}
                      onSelect={() => setSelectedId(n.id)}
                      onStartEdit={() => {
                        setSelectedId(n.id);
                        setEditingId(n.id);
                      }}
                      onEndEdit={() => setEditingId(undefined)}
                      onChange={(patch) => updateNode(project.id, n.id, patch)}
                      onDelete={() => {
                        deleteNode(project.id, n.id);
                        setSelectedId(n.parentId ?? undefined);
                        setEditingId(undefined);
                      }}
                      onDragStart={(e) => onNodeDragStart(n, e)}
                      onStartConnect={(e) => startConnect(n, e)}
                      onAddChild={() => {
                        const id = addNode(project.id, { parentId: n.id });
                        setSelectedId(id);
                        setEditingId(id);
                      }}
                      onToggleCollapsed={() => toggleCollapsed(project.id, n.id)}
                      onPickImage={async () => {
                        try {
                          const ref = await pickMediaAndStore("image");
                          if (!ref) return;
                          updateNode(project.id, n.id, {
                            imageRef: ref,
                            imageName: ref.name,
                            image: undefined,
                          });
                        } catch (error) {
                          console.error("[mindmap] image pick", error);
                          alert("Não foi possível adicionar essa imagem.");
                        }
                      }}
                      onPickVideo={async () => {
                        try {
                          const ref = await pickMediaAndStore("video");
                          if (!ref) return;
                          updateNode(project.id, n.id, {
                            imageRef: ref,
                            imageName: ref.name,
                            image: undefined,
                          });
                        } catch (error) {
                          console.error("[mindmap] video pick", error);
                          alert("Não foi possível adicionar esse vídeo.");
                        }
                      }}


                    />
                  </div>
                );
              })}
            </MindMapCanvas>
          </div>

          {project.nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="pointer-events-auto text-center rounded-xl border border-dashed border-border/60 bg-card/50 px-8 py-10">
                <p className="text-muted-foreground mb-4">Comece adicionando um nó ao seu mapa.</p>
                <Button onClick={handleAdd} className="gap-2">
                  <Plus className="size-4" /> Adicionar nó
                </Button>
              </div>
            </div>
          )}

          {/* Bottom bar: zoom + hints */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-full border border-border/60 bg-popover/90 backdrop-blur px-2 py-1 text-xs font-mono">
            <button
              className="px-2 py-1 hover:bg-muted rounded-full"
              onClick={() => setViewport((v) => ({ ...v, zoom: Math.max(0.2, v.zoom / 1.2) }))}
            >
              −
            </button>
            <span className="tabular-nums">{Math.round(viewport.zoom * 100)}%</span>
            <button
              className="px-2 py-1 hover:bg-muted rounded-full"
              onClick={() => setViewport((v) => ({ ...v, zoom: Math.min(2.5, v.zoom * 1.2) }))}
            >
              +
            </button>
          </div>

          <div className="absolute bottom-4 right-4 rounded-lg border border-border/60 bg-popover/85 backdrop-blur px-3 py-2 text-[11px] leading-relaxed text-muted-foreground max-w-[240px]">
            <div className="text-foreground/80 font-semibold mb-1">Atalhos</div>
            <div><kbd className="font-mono">Tab</kbd> filho · <kbd className="font-mono">Enter</kbd> irmão</div>
            <div><kbd className="font-mono">F2</kbd> editar · <kbd className="font-mono">Del</kbd> excluir · <kbd className="font-mono">Espaço</kbd> recolher</div>
            <div>Alça azul: puxar p/ criar/reconectar</div>
            <div><kbd className="font-mono">Alt</kbd>+arrastar: mudar pai · Duplo-clique: novo nó</div>
          </div>
        </main>

        {selectedId && (
          <aside className="w-64 shrink-0 border-l border-border/60 bg-card/40 flex flex-col">
            <div className="px-4 py-3 border-b border-border/60">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Nó selecionado</div>
            </div>
            <SelectedPanel
              node={project.nodes.find((n) => n.id === selectedId)}
              onDetach={() => selectedId && setParent(project.id, selectedId, null)}
              onDelete={() => {
                if (!selectedId) return;
                const sel = project.nodes.find((n) => n.id === selectedId);
                deleteNode(project.id, selectedId);
                setSelectedId(sel?.parentId ?? undefined);
              }}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

function SelectedPanel({
  node,
  onDetach,
  onDelete,
}: {
  node: MindNode | undefined;
  onDetach: () => void;
  onDelete: () => void;
}) {
  if (!node) return null;
  return (
    <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
      <div className="rounded-md bg-muted/40 border border-border/50 p-3">
        <div className="text-xs text-muted-foreground mb-1">Texto</div>
        <div className="whitespace-pre-wrap text-foreground">
          {node.text || <span className="italic text-muted-foreground/60">vazio</span>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>
          <div>Pai</div>
          <div className="text-foreground">{node.parentId ? "sim" : "raiz"}</div>
        </div>
        <div>
          <div>Recolhido</div>
          <div className="text-foreground">{node.collapsed ? "sim" : "não"}</div>
        </div>
      </div>
      <div className="pt-2 space-y-1">
        {node.parentId && (
          <button
            onClick={onDetach}
            className="w-full text-left rounded-md px-3 py-2 text-xs hover:bg-muted"
          >
            Desconectar do pai (virar raiz)
          </button>
        )}
        <button
          onClick={onDelete}
          className="w-full text-left rounded-md px-3 py-2 text-xs text-destructive hover:bg-destructive/10 flex items-center gap-2"
        >
          <Trash2 className="size-3.5" /> Excluir nó (e filhos)
        </button>
      </div>
    </div>
  );
}
