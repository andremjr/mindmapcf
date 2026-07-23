import { useRef, useState, useCallback, type ReactNode, type PointerEvent, type WheelEvent } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

/**
 * Infinite pan/zoom canvas wrapper. Drag anywhere on the background to pan,
 * wheel to zoom, buttons for zoom in/out/reset. Children render at their
 * natural size inside a transformed layer.
 */
export function PanZoom({
  children,
  className = "",
  minScale = 0.3,
  maxScale = 2.5,
  initialScale = 0.9,
}: {
  children: ReactNode;
  className?: string;
  minScale?: number;
  maxScale?: number;
  initialScale?: number;
}) {
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [scale, setScale] = useState(initialScale);
  const dragging = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // Only start panning when clicking the background layer, not a child button/card
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, [data-nopan]")) return;
    dragging.current = { x: e.clientX, y: e.clientY, tx, ty };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setTx(dragging.current.tx + (e.clientX - dragging.current.x));
    setTy(dragging.current.ty + (e.clientY - dragging.current.y));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = null;
    try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const onWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setScale((s) => {
      const next = Math.max(minScale, Math.min(maxScale, s * factor));
      const ratio = next / s;
      setTx((prev) => cx - (cx - prev) * ratio);
      setTy((prev) => cy - (cy - prev) * ratio);
      return next;
    });
  }, [minScale, maxScale]);

  const reset = () => { setTx(0); setTy(0); setScale(initialScale); };
  const zoomBy = (f: number) => setScale((s) => Math.max(minScale, Math.min(maxScale, s * f)));

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden touch-none select-none ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      style={{ cursor: dragging.current ? "grabbing" : "grab" }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
      >
        {children}
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/70 backdrop-blur px-2 py-1 border border-white/10 z-10" data-nopan>
        <button onClick={() => zoomBy(1 / 1.2)} className="size-7 grid place-items-center rounded-full hover:bg-white/10 text-white/80" aria-label="Zoom out">
          <ZoomOut className="size-3.5" />
        </button>
        <div className="text-[10px] tabular-nums text-white/70 w-10 text-center">{Math.round(scale * 100)}%</div>
        <button onClick={() => zoomBy(1.2)} className="size-7 grid place-items-center rounded-full hover:bg-white/10 text-white/80" aria-label="Zoom in">
          <ZoomIn className="size-3.5" />
        </button>
        <div className="w-px h-4 bg-white/15 mx-1" />
        <button onClick={reset} className="size-7 grid place-items-center rounded-full hover:bg-white/10 text-white/80" aria-label="Reset">
          <Maximize2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
