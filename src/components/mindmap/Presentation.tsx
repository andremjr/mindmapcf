import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, X, Download } from "lucide-react";
import type { Project } from "@/lib/types";
import { presentationOrder, descendantIds } from "@/lib/store";
import { MindMapCanvas } from "./MindMapCanvas";
import { NodeCard } from "./NodeCard";
import { RecorderHUD } from "./RecorderHUD";
import {
  isRecording,
  stopRecording,
  cancelRecording,
  getRecorderState,
  subscribeRecorder,
  type RecordingResult,
} from "@/lib/screenRecorder";

type Viewport = { x: number; y: number; zoom: number };

const FOCUS_ZOOM = 2.2;
const TRANSITION_MS = 1100;

function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function Presentation({
  project,
  recording = false,
}: {
  project: Project;
  recording?: boolean;
}) {
  const navigate = useNavigate();
  const order = presentationOrder(project);
  const [idx, setIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1280, h: 720 });
  const [result, setResult] = useState<RecordingResult | null>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      const r = containerRef.current!.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const visibleIds = useMemo(() => {
    const hidden = new Set<string>();
    for (const n of project.nodes) {
      if (n.collapsed) {
        for (const d of descendantIds(project.nodes, n.id)) hidden.add(d);
      }
    }
    return new Set(project.nodes.map((n) => n.id).filter((id) => !hidden.has(id)));
  }, [project.nodes]);

  const activeId = order[idx];
  const activeNode = project.nodes.find((n) => n.id === activeId);

  const initialVp: Viewport = { x: 0, y: 0, zoom: 0.45 };
  const [viewport, setViewport] = useState<Viewport>(initialVp);
  const rafRef = useRef<number | null>(null);
  const viewportRef = useRef<Viewport>(initialVp);
  viewportRef.current = viewport;
  const prevIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeNode) return;
    const from = viewportRef.current;
    const target: Viewport = { x: activeNode.x, y: activeNode.y, zoom: FOCUS_ZOOM };

    const prevId = prevIdRef.current;
    const prevNode = prevId ? project.nodes.find((n) => n.id === prevId) : null;
    let useArc = true;
    if (prevNode) {
      const descending = activeNode.parentId === prevNode.id;
      const sibling =
        !!activeNode.parentId && activeNode.parentId === prevNode.parentId;
      if (descending || sibling) useArc = false;
    }
    prevIdRef.current = activeNode.id;

    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const dist = Math.hypot(dx, dy);
    const midZoom = useArc
      ? Math.max(0.55, FOCUS_ZOOM - Math.min(0.85, dist / 1200))
      : from.zoom;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const start = performance.now();

    function step(now: number) {
      const t = Math.min(1, (now - start) / TRANSITION_MS);
      const e = ease(t);
      const zoomCurve = useArc
        ? t < 0.5
          ? from.zoom + (midZoom - from.zoom) * ease(t * 2)
          : midZoom + (target.zoom - midZoom) * ease((t - 0.5) * 2)
        : from.zoom + (target.zoom - from.zoom) * e;
      setViewport({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        zoom: zoomCurve,
      });
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else rafRef.current = null;
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  function next() {
    setIdx((i) => Math.min(order.length - 1, i + 1));
  }
  function prev() {
    setIdx((i) => Math.max(0, i - 1));
  }
  async function exit() {
    if (isRecording()) {
      try {
        const r = await stopRecording();
        setResult(r);
        // Trigger download automatically.
        const a = document.createElement("a");
        a.href = r.url;
        a.download = r.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (e) {
        console.error("[presentation] stop recording", e);
      }
      // Keep the fullscreen exit + navigation for after the modal closes.
      return;
    }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    navigate({ to: "/projects/$id", params: { id: project.id } });
  }

  function closeResult() {
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    navigate({ to: "/projects/$id", params: { id: project.id } });
  }

  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    }
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      // If the component unmounts while recording (rare), throw the recording away.
      if (isRecording()) cancelRecording().catch(() => {});
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
      } else if ((e.key === "r" || e.key === "R") && recording) {
        e.preventDefault();
        exit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.length, recording]);

  // Recording HUD ticker.
  const [recTick, setRecTick] = useState(0);
  useEffect(() => {
    if (!recording) return;
    const unsub = subscribeRecorder(() => setRecTick((n) => n + 1));
    const interval = window.setInterval(() => setRecTick((n) => n + 1), 500);
    return () => {
      unsub();
      window.clearInterval(interval);
    };
  }, [recording]);
  const recState = recording ? getRecorderState() : null;
  const elapsedMs =
    recState && recState.startedAt ? performance.now() - recState.startedAt : 0;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _tick = recTick;

  const [uiVisible, setUiVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);
  useEffect(() => {
    function bump() {
      setUiVisible(true);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setUiVisible(false), 2200);
    }
    bump();
    window.addEventListener("mousemove", bump);
    window.addEventListener("keydown", bump);
    return () => {
      window.removeEventListener("mousemove", bump);
      window.removeEventListener("keydown", bump);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-background text-foreground overflow-hidden">
      <div ref={containerRef} className="absolute inset-0">
        <MindMapCanvas
          nodes={project.nodes}
          visibleIds={visibleIds}
          viewport={viewport}
          containerSize={size}
        >
          {project.nodes.map((n) => {
            if (!visibleIds.has(n.id)) return null;
            return (
              <NodeCard
                key={n.id}
                node={n}
                childCount={0}
                selected={false}
                editing={false}
                active={n.id === activeId}
                presentation
                onSelect={() => {}}
                onStartEdit={() => {}}
                onEndEdit={() => {}}
                onChange={() => {}}
                onDelete={() => {}}
                onDragStart={() => {}}
              />
            );
          })}
        </MindMapCanvas>
      </div>

      {/* Recording HUD — opens in a Document PiP window when supported so it
          isn't captured by the screen recording. */}
      {recording && recState?.state === "recording" && recState.startedAt != null && (
        <RecorderHUD startedAt={recState.startedAt} onStop={exit} />
      )}


      {/* Overlay UI — hidden while recording so it never leaks into the file. */}
      {!recording && (
        <>
          <div
            className={`absolute top-4 right-4 z-10 transition-opacity duration-300 ${
              uiVisible ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <button
              onClick={exit}
              className="size-10 grid place-items-center rounded-full bg-card/70 backdrop-blur border border-border/60 hover:bg-card"
              aria-label="Sair da apresentação"
            >
              <X className="size-4" />
            </button>
          </div>

          <div
            className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-card/70 backdrop-blur border border-border/60 px-2 py-2 transition-opacity duration-300 ${
              uiVisible ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
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
        </>
      )}


      {order.length === 0 && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="text-muted-foreground">Adicione nós antes de apresentar.</p>
        </div>
      )}

      {/* Post-recording modal */}
      {result && (
        <div className="absolute inset-0 z-30 bg-background/90 backdrop-blur grid place-items-center p-6">
          <div className="w-full max-w-2xl rounded-2xl border border-border/60 bg-card shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Gravação finalizada</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {result.mimeType} · {formatDuration(result.durationMs)} ·{" "}
                  {(result.blob.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              <button
                onClick={closeResult}
                className="size-8 grid place-items-center rounded-full hover:bg-muted"
                aria-label="Fechar"
              >
                <X className="size-4" />
              </button>
            </div>
            <video
              src={result.url}
              controls
              className="w-full aspect-video bg-black"
            />
            <div className="px-6 py-4 flex items-center justify-end gap-2">
              <button
                onClick={closeResult}
                className="px-3 py-2 text-sm rounded-md hover:bg-muted"
              >
                Fechar
              </button>
              <a
                href={result.url}
                download={result.filename}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90"
              >
                <Download className="size-4" /> Baixar novamente
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
