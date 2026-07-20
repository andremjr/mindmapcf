import { forwardRef } from "react";
import type { MindNode } from "@/lib/types";

interface PendingEdge {
  fromId: string;
  toX: number;
  toY: number;
}

interface Props {
  nodes: MindNode[];
  visibleIds: Set<string>;
  viewport: { x: number; y: number; zoom: number };
  containerSize: { w: number; h: number };
  children: React.ReactNode;
  animated?: boolean;
  pendingEdge?: PendingEdge | null;
  /** Effective accent color per node id (parent→child edge uses child's color). */
  colorById?: Map<string, string>;
  /** Presentation mode: only the edge terminating at this node id is lit; others dim. */
  activeEdgeToId?: string | null;
  onBackgroundPointerDown?: (e: React.PointerEvent) => void;
  onWheel?: (e: React.WheelEvent) => void;
  onBackgroundDoubleClick?: (e: React.MouseEvent) => void;
}


/**
 * Infinite pannable/zoomable canvas.
 * Draws parent→child edges as horizontal-bias curves.
 */
export const MindMapCanvas = forwardRef<HTMLDivElement, Props>(function MindMapCanvas(
  {
    nodes,
    visibleIds,
    viewport,
    containerSize,
    children,
    animated,
    pendingEdge,
    colorById,
    activeEdgeToId,
    onBackgroundPointerDown,
    onWheel,
    onBackgroundDoubleClick,
  },
  ref,
) {

  const { x, y, zoom } = viewport;
  const cx = containerSize.w / 2;
  const cy = containerSize.h / 2;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges: Array<{ from: MindNode; to: MindNode }> = [];
  for (const n of nodes) {
    if (!visibleIds.has(n.id)) continue;
    if (!n.parentId) continue;
    const p = nodeById.get(n.parentId);
    if (!p || !visibleIds.has(p.id)) continue;
    edges.push({ from: p, to: n });
  }

  // SVG bounds covering nodes + slack.
  const pad = 5000;
  let minX = -pad,
    minY = -pad,
    maxX = pad,
    maxY = pad;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - 1000);
    maxX = Math.max(maxX, n.x + 1000);
    minY = Math.min(minY, n.y - 1000);
    maxY = Math.max(maxY, n.y + 1000);
  }
  const svgW = maxX - minX;
  const svgH = maxY - minY;

  function edgePath(a: MindNode, b: MindNode) {
    const aw = a.width ?? 260;
    const bw = b.width ?? 260;
    const goingRight = b.x >= a.x;
    const ax = a.x + (goingRight ? aw / 2 : -aw / 2);
    const bx = b.x + (goingRight ? -bw / 2 : bw / 2);
    const ay = a.y;
    const by = b.y;
    const dx = Math.abs(bx - ax);
    const c = Math.max(40, dx * 0.5);
    const c1x = ax + (goingRight ? c : -c);
    const c2x = bx + (goingRight ? -c : c);
    return `M ${ax} ${ay} C ${c1x} ${ay}, ${c2x} ${by}, ${bx} ${by}`;
  }

  return (
    <div
      ref={ref}
      className="absolute inset-0 overflow-hidden select-none"
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, color-mix(in oklch, var(--border) 45%, transparent) 1px, transparent 0)",
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${cx - x * zoom}px ${cy - y * zoom}px`,
      }}
      onPointerDown={onBackgroundPointerDown}
      onWheel={onWheel}
      onDoubleClick={onBackgroundDoubleClick}
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
        <svg
          className="absolute pointer-events-none"
          style={{ left: minX, top: minY, width: svgW, height: svgH, overflow: "visible" }}
          viewBox={`${minX} ${minY} ${svgW} ${svgH}`}
        >
          {edges.map(({ from, to }, i) => {
            const c = colorById?.get(to.id);
            const isActive = activeEdgeToId != null && to.id === activeEdgeToId;
            const dimMode = activeEdgeToId !== undefined;
            const strokeColor = c ?? "var(--primary)";
            const stroke = isActive
              ? strokeColor
              : dimMode
              ? `color-mix(in oklch, ${strokeColor} 14%, transparent)`
              : `color-mix(in oklch, ${strokeColor} 70%, transparent)`;
            return (
              <path
                key={`${from.id}->${to.id}`}
                d={edgePath(from, to)}
                stroke={stroke}
                strokeWidth={isActive ? 3 : 2}
                strokeLinecap="round"
                fill="none"
                pathLength={isActive ? 1 : undefined}
                strokeDasharray={isActive ? 1 : undefined}
                style={
                  isActive
                    ? {
                        animation: "mindmap-edge-fill 900ms ease-out forwards",
                        filter: `drop-shadow(0 0 6px color-mix(in oklch, ${strokeColor} 55%, transparent))`,
                      }
                    : undefined
                }
              />
            );
          })}

          {pendingEdge && (() => {
            const from = nodeById.get(pendingEdge.fromId);
            if (!from) return null;
            const fw = from.width ?? 260;
            const goingRight = pendingEdge.toX >= from.x;
            const ax = from.x + (goingRight ? fw / 2 : -fw / 2);
            const ay = from.y;
            const bx = pendingEdge.toX;
            const by = pendingEdge.toY;
            const dx = Math.abs(bx - ax);
            const c = Math.max(40, dx * 0.5);
            return (
              <path
                d={`M ${ax} ${ay} C ${ax + (goingRight ? c : -c)} ${ay}, ${bx + (goingRight ? -c : c)} ${by}, ${bx} ${by}`}
                stroke="color-mix(in oklch, var(--primary) 90%, transparent)"
                strokeWidth={2}
                strokeDasharray="6 6"
                fill="none"
              />
            );
          })()}
        </svg>

        {children}
      </div>
    </div>
  );
});
