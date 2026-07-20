import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft,
  Plus,
  Play,
  Maximize,
  GripVertical,
  ListOrdered,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Project, MindNode } from "@/lib/types";
import { useStore, presentationOrder } from "@/lib/store";
import { MindMapCanvas } from "./MindMapCanvas";
import { NodeCard } from "./NodeCard";

export function MindMapEditor({ project }: { project: Project }) {
  const addNode = useStore((s) => s.addNode);
  const updateNode = useStore((s) => s.updateNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const reorderNodes = useStore((s) => s.reorderNodes);
  const renameProject = useStore((s) => s.renameProject);
  const setViewportPersist = useStore((s) => s.setViewport);
  const navigate = useNavigate();

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [viewport, setViewport] = useState(project.viewport ?? { x: 0, y: 0, zoom: 1 });
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [sidebar, setSidebar] = useState(true);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      const r = containerRef.current!.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Persist viewport (debounced by setTimeout).
  useEffect(() => {
    const t = setTimeout(() => setViewportPersist(project.id, viewport), 400);
    return () => clearTimeout(t);
  }, [viewport, project.id, setViewportPersist]);

  const order = presentationOrder(project);

  // --- Panning ---
  const panRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  function onBgPointerDown(e: React.PointerEvent) {
    // Only pan on background clicks (not nodes)
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    setSelectedId(undefined);
    if (e.button !== 0 && e.button !== 1) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    panRef.current = { x: e.clientX, y: e.clientY, vx: viewport.x, vy: viewport.y };
  }
  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!panRef.current) return;
      const dx = (e.clientX - panRef.current.x) / viewport.zoom;
      const dy = (e.clientY - panRef.current.y) / viewport.zoom;
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
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    const newZoom = Math.max(0.15, Math.min(3, viewport.zoom * (1 + delta)));
    // Zoom around cursor
    const rect = containerRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left - rect.width / 2;
    const my = e.clientY - rect.top - rect.height / 2;
    const worldX = viewport.x + mx / viewport.zoom;
    const worldY = viewport.y + my / viewport.zoom;
    const nx = worldX - mx / newZoom;
    const ny = worldY - my / newZoom;
    setViewport({ x: nx, y: ny, zoom: newZoom });
  }

  // --- Node dragging ---
  const dragRef = useRef<{ id: string; startX: number; startY: number; nx: number; ny: number } | null>(null);
  function onNodeDragStart(node: MindNode, e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { id: node.id, startX: e.clientX, startY: e.clientY, nx: node.x, ny: node.y };
  }
  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragRef.current) return;
      const d = dragRef.current;
      const dx = (e.clientX - d.startX) / viewport.zoom;
      const dy = (e.clientY - d.startY) / viewport.zoom;
      updateNode(project.id, d.id, { x: d.nx + dx, y: d.ny + dy });
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [viewport.zoom, project.id, updateNode]);

  function handleAdd() {
    // Spawn near current viewport center
    const id = addNode(project.id, { x: viewport.x, y: viewport.y });
    setSelectedId(id);
  }

  function handlePresent() {
    setViewportPersist(project.id, viewport);
    navigate({ to: "/projects/$id/present", params: { id: project.id } });
  }

  function fitAll() {
    if (project.nodes.length === 0) {
      setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of project.nodes) {
      const w = n.width ?? 360;
      minX = Math.min(minX, n.x - w / 2);
      maxX = Math.max(maxX, n.x + w / 2);
      minY = Math.min(minY, n.y - 200);
      maxY = Math.max(maxY, n.y + 200);
    }
    const bw = maxX - minX + 200;
    const bh = maxY - minY + 200;
    const zoom = Math.min(size.w / bw, size.h / bh, 1);
    setViewport({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom });
  }

  // Reorder in sidebar
  const [dragOrder, setDragOrder] = useState<{ from: number; over: number } | null>(null);

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
          <Button variant="ghost" size="sm" onClick={() => setSidebar((v) => !v)} className="gap-2">
            <ListOrdered className="size-4" /> Ordem
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
              order={order}
              viewport={viewport}
              containerSize={size}
              onBackgroundPointerDown={onBgPointerDown}
              onWheel={onWheel}
            >
              {project.nodes.map((n) => {
                const idx = order.indexOf(n.id);
                return (
                  <div key={n.id} data-node>
                    <NodeCard
                      node={n}
                      orderIndex={idx >= 0 ? idx : null}
                      selected={selectedId === n.id}
                      onSelect={() => setSelectedId(n.id)}
                      onChange={(patch) => updateNode(project.id, n.id, patch)}
                      onDelete={() => {
                        deleteNode(project.id, n.id);
                        setSelectedId(undefined);
                      }}
                      onDragStart={(e) => onNodeDragStart(n, e)}
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

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full border border-border/60 bg-popover/90 backdrop-blur px-1 py-1 text-xs font-mono">
            <button className="px-2 py-1 hover:bg-muted rounded-full" onClick={() => setViewport((v) => ({ ...v, zoom: Math.max(0.15, v.zoom / 1.2) }))}>−</button>
            <span className="px-2 tabular-nums">{Math.round(viewport.zoom * 100)}%</span>
            <button className="px-2 py-1 hover:bg-muted rounded-full" onClick={() => setViewport((v) => ({ ...v, zoom: Math.min(3, v.zoom * 1.2) }))}>+</button>
          </div>
        </main>

        {sidebar && (
          <aside className="w-72 shrink-0 border-l border-border/60 bg-card/40 flex flex-col">
            <div className="px-4 py-3 border-b border-border/60">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Ordem de apresentação</div>
              <p className="text-xs text-muted-foreground/70 mt-1">Arraste para reorganizar.</p>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-1">
              {order.map((id, i) => {
                const n = project.nodes.find((x) => x.id === id);
                if (!n) return null;
                const isOver = dragOrder?.over === i && dragOrder.from !== i;
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={() => setDragOrder({ from: i, over: i })}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOrder((d) => (d ? { ...d, over: i } : null));
                    }}
                    onDrop={() => {
                      if (!dragOrder) return;
                      const next = order.slice();
                      const [moved] = next.splice(dragOrder.from, 1);
                      next.splice(dragOrder.over, 0, moved);
                      reorderNodes(project.id, next);
                      setDragOrder(null);
                    }}
                    onDragEnd={() => setDragOrder(null)}
                    onClick={() => {
                      setSelectedId(id);
                      setViewport((v) => ({ ...v, x: n.x, y: n.y }));
                    }}
                    className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer border ${
                      selectedId === id ? "bg-primary/10 border-primary/40" : "border-transparent hover:bg-muted/50"
                    } ${isOver ? "border-primary" : ""}`}
                  >
                    <GripVertical className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="size-6 rounded-full bg-primary/20 text-primary text-[11px] font-mono grid place-items-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="truncate text-foreground/90">{n.text || "Sem texto"}</span>
                  </div>
                );
              })}
              {order.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Sem nós ainda.</p>
              )}
            </div>
            <div className="p-3 border-t border-border/60 text-[11px] text-muted-foreground leading-relaxed">
              <p><b>Atalhos:</b></p>
              <p>• Arrastar fundo: mover</p>
              <p>• Scroll: zoom</p>
              <p>• Duplo clique no nó: editar</p>
              <p>• F5 / Apresentar: modo apresentação</p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
