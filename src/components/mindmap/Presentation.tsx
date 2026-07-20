import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Project } from "@/lib/types";
import { presentationOrder } from "@/lib/store";
import { MindMapCanvas } from "./MindMapCanvas";
import { NodeCard } from "./NodeCard";

export function Presentation({ project }: { project: Project }) {
  const navigate = useNavigate();
  const order = presentationOrder(project);
  const [idx, setIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1280, h: 720 });

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      const r = containerRef.current!.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const activeId = order[idx];
  const activeNode = project.nodes.find((n) => n.id === activeId);

  // Compute viewport that focuses on the active node.
  const focusZoom = 1.35;
  const viewport = activeNode
    ? { x: activeNode.x, y: activeNode.y, zoom: focusZoom }
    : { x: 0, y: 0, zoom: 1 };

  function next() {
    setIdx((i) => Math.min(order.length - 1, i + 1));
  }
  function prev() {
    setIdx((i) => Math.max(0, i - 1));
  }
  function exit() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    navigate({ to: "/projects/$id", params: { id: project.id } });
  }

  useEffect(() => {
    // Enter fullscreen on mount.
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    }
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape") {
        exit();
      } else if (e.key === "Home") {
        setIdx(0);
      } else if (e.key === "End") {
        setIdx(order.length - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order.length]);

  return (
    <div className="fixed inset-0 bg-background text-foreground">
      <div ref={containerRef} className="absolute inset-0">
        <MindMapCanvas
          nodes={project.nodes}
          order={order}
          viewport={viewport}
          containerSize={size}
          animated
        >
          {project.nodes.map((n) => {
            const oi = order.indexOf(n.id);
            return (
              <div key={n.id}>
                <NodeCard
                  node={n}
                  orderIndex={oi >= 0 ? oi : null}
                  selected={false}
                  active={n.id === activeId}
                  presentation
                  onSelect={() => {}}
                  onChange={() => {}}
                  onDelete={() => {}}
                  onDragStart={() => {}}
                />
              </div>
            );
          })}
        </MindMapCanvas>
      </div>

      {/* Controls */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={exit}
          className="size-10 grid place-items-center rounded-full bg-card/70 backdrop-blur border border-border/60 hover:bg-card"
          aria-label="Sair da apresentação"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-card/70 backdrop-blur border border-border/60 px-2 py-2">
        <button
          onClick={prev}
          disabled={idx === 0}
          className="size-9 grid place-items-center rounded-full hover:bg-muted disabled:opacity-40"
          aria-label="Anterior"
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="px-3 text-sm font-mono tabular-nums text-muted-foreground min-w-[70px] text-center">
          {order.length > 0 ? `${idx + 1} / ${order.length}` : "0 / 0"}
        </span>
        <button
          onClick={next}
          disabled={idx >= order.length - 1}
          className="size-9 grid place-items-center rounded-full hover:bg-muted disabled:opacity-40"
          aria-label="Próximo"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {order.length === 0 && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="text-muted-foreground">Adicione nós antes de apresentar.</p>
        </div>
      )}
    </div>
  );
}
