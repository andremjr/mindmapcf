import { forwardRef } from "react";
import type { MindNode } from "@/lib/types";

interface Props {
  nodes: MindNode[];
  order: string[];
  viewport: { x: number; y: number; zoom: number };
  containerSize: { w: number; h: number };
  children: React.ReactNode;
  animated?: boolean;
  onBackgroundPointerDown?: (e: React.PointerEvent) => void;
  onWheel?: (e: React.WheelEvent) => void;
}

/**
 * Infinite pannable/zoomable canvas.
 * Applies a transform that centers `viewport.x/y` in the container at zoom `viewport.zoom`.
 */
export const MindMapCanvas = forwardRef<HTMLDivElement, Props>(function MindMapCanvas(
  { nodes, order, viewport, containerSize, children, animated, onBackgroundPointerDown, onWheel },
  ref,
) {
  const { x, y, zoom } = viewport;
  const cx = containerSize.w / 2;
  const cy = containerSize.h / 2;

  // Build connectors between consecutive nodes in presentation order.
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const pairs: [MindNode, MindNode][] = [];
  for (let i = 0; i < order.length - 1; i++) {
    const a = nodeById.get(order[i]);
    const b = nodeById.get(order[i + 1]);
    if (a && b) pairs.push([a, b]);
  }

  // Compute a wide SVG canvas that covers all nodes.
  const pad = 4000;
  let minX = -pad, minY = -pad, maxX = pad, maxY = pad;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - 800);
    maxX = Math.max(maxX, n.x + 800);
    minY = Math.min(minY, n.y - 800);
    maxY = Math.max(maxY, n.y + 800);
  }
  const svgW = maxX - minX;
  const svgH = maxY - minY;

  return (
    <div
      ref={ref}
      className="absolute inset-0 overflow-hidden select-none"
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, hsl(var(--border) / 0.5) 1px, transparent 0)",
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${cx - x * zoom}px ${cy - y * zoom}px`,
      }}
      onPointerDown={onBackgroundPointerDown}
      onWheel={onWheel}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          transform: `translate(${cx}px, ${cy}px) scale(${zoom}) translate(${-x}px, ${-y}px)`,
          transformOrigin: "0 0",
          transition: animated ? "transform 900ms cubic-bezier(0.22, 1, 0.36, 1)" : undefined,
          willChange: "transform",
        }}
      >
        {/* Connectors */}
        <svg
          className="absolute pointer-events-none"
          style={{ left: minX, top: minY, width: svgW, height: svgH, overflow: "visible" }}
          viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
        >
          {pairs.map(([a, b], i) => {
            const dx = (b.x - a.x) * 0.5;
            return (
              <path
                key={i}
                d={`M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`}
                stroke="hsl(var(--primary) / 0.35)"
                strokeWidth={2}
                fill="none"
                strokeDasharray="6 8"
              />
            );
          })}
        </svg>

        {children}
      </div>
    </div>
  );
});
