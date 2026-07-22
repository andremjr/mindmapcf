import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, X, Download, ExternalLink, Link as LinkIcon } from "lucide-react";
import type { Project } from "@/lib/types";
import { presentationOrder, descendantIds } from "@/lib/store";
import { buildColorMap } from "@/lib/nodeColors";
import { MindMapCanvas } from "./MindMapCanvas";
import { NodeCard } from "./NodeCard";
import { RecorderHUD } from "./RecorderHUD";
import { SonicAvatarOverlay } from "./SonicAvatarOverlay";
import { useStore } from "@/lib/store";

import {
  isRecording,
  stopRecording,
  cancelRecording,
  getRecorderState,
  subscribeRecorder,
  cropRecordingToElement,
  beginArmedRecording,
  type RecordingResult,
} from "@/lib/screenRecorder";
import { loadRecordFormat, defaultRecordFormat, type RecordFormat } from "@/lib/recordFormats";

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
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1280, h: 720 });
  const [result, setResult] = useState<RecordingResult | null>(null);
  const [cropOk, setCropOk] = useState(false);
  // 3-2-1 countdown after recording starts, so the root node is already
  // focused when the "real" content begins. null = no countdown running.
  const [countdown, setCountdown] = useState<number | null>(null);

  // When recording, render the canvas inside a fixed-aspect frame so Region
  // Capture crops the tab video track to exactly that rectangle. Off-frame UI
  // (HUD, pager, exit button) then can't leak into the recording.
  const format: RecordFormat | null = recording
    ? loadRecordFormat(project.id) ?? defaultRecordFormat()
    : null;

  const [winSize, setWinSize] = useState({
    w: typeof window !== "undefined" ? window.innerWidth : 1280,
    h: typeof window !== "undefined" ? window.innerHeight : 720,
  });
  useEffect(() => {
    function onResize() {
      setWinSize({ w: window.innerWidth, h: window.innerHeight });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Compute the CSS size of the frame. When recording, letterbox to fit the
  // chosen aspect leaving room for controls (~180px vertical margin).
  const frameCssSize = useMemo(() => {
    if (!format) return { w: winSize.w, h: winSize.h };
    const availW = winSize.w - 32;
    const availH = winSize.h - 180;
    const scale = Math.min(availW / format.width, availH / format.height, 1);
    return { w: format.width * scale, h: format.height * scale };
  }, [format, winSize]);

  useLayoutEffect(() => {
    if (!frameRef.current) return;
    const ro = new ResizeObserver(() => {
      const r = frameRef.current!.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(frameRef.current);
    const r0 = frameRef.current.getBoundingClientRect();
    setSize({ w: r0.width, h: r0.height });
    return () => ro.disconnect();
  }, []);

  // Apply Region Capture once frame is mounted.
  useEffect(() => {
    if (!recording || !frameRef.current) return;
    let cancelled = false;
    cropRecordingToElement(frameRef.current).then((ok) => {
      if (cancelled) return;
      setCropOk(ok);
      if (!ok) {
        cancelRecording().catch(() => undefined);
        window.alert(
          "A gravação foi cancelada porque o navegador não conseguiu recortar só o quadro. Use Chrome/Edge no desktop e selecione a guia atual do Canvas Narrativo.",
        );
        navigate({ to: "/projects/$id", params: { id: project.id } });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [recording, navigate, project.id]);

  // Start a 3s countdown as soon as the recording frame is cropped and the
  // root node is centered. The MediaRecorder is armed but not capturing yet —
  // it only begins when the countdown reaches 0, so the final video starts
  // clean with the root node already in focus.
  useEffect(() => {
    if (!recording || !cropOk) return;
    setIdx(0);
    setCountdown(3);
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setCountdown(2), 1000));
    timers.push(window.setTimeout(() => setCountdown(1), 2000));
    timers.push(
      window.setTimeout(() => {
        setCountdown(null);
        try {
          beginArmedRecording();
        } catch (e) {
          console.error("[presentation] begin recording", e);
        }
      }, 3000),
    );
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [recording, cropOk]);


  const visibleIds = useMemo(() => {
    const hidden = new Set<string>();
    for (const n of project.nodes) {
      if (n.collapsed) {
        for (const d of descendantIds(project.nodes, n.id)) hidden.add(d);
      }
    }
    return new Set(project.nodes.map((n) => n.id).filter((id) => !hidden.has(id)));
  }, [project.nodes]);

  const colorMap = useMemo(() => buildColorMap(project.nodes), [project.nodes]);

  const activeId = order[idx];
  const activeNode = project.nodes.find((n) => n.id === activeId);

  // Lit id lags activeId so the node "acende" only when the incoming edge
  // fill animation reaches it. Root has no incoming edge → lights immediately.
  const [litId, setLitId] = useState<string | undefined>(activeId);
  useEffect(() => {
    if (!activeNode) return;
    if (!activeNode.parentId) {
      setLitId(activeId);
      return;
    }
    setLitId(undefined);
    const t = window.setTimeout(() => setLitId(activeId), 900);
    return () => window.clearTimeout(t);
  }, [activeId, activeNode?.parentId]);

  const initialVp: Viewport = { x: 0, y: 0, zoom: 0.45 };
  const [viewport, setViewport] = useState<Viewport>(initialVp);
  const rafRef = useRef<number | null>(null);
  const viewportRef = useRef<Viewport>(initialVp);
  viewportRef.current = viewport;
  const prevIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeNode) return;
    const from = viewportRef.current;

    // Fit-to-frame: measure the active node's natural (unscaled) size and
    // clamp the focus zoom so it fits inside the current frame with margin.
    // Wait a frame so images/videos in the node have laid out.
    let fitZoom = FOCUS_ZOOM;
    const frameEl = frameRef.current;
    if (frameEl) {
      const el = frameEl.querySelector<HTMLElement>(
        `[data-node-id="${activeNode.id}"]`,
      );
      const fw = size.w || frameEl.clientWidth;
      const fh = size.h || frameEl.clientHeight;
      if (el && fw > 0 && fh > 0) {
        const nw = el.offsetWidth;
        const nh = el.offsetHeight;
        if (nw > 0 && nh > 0) {
          const margin = 0.85; // leave 15% breathing room
          const maxZ = Math.min((fw * margin) / nw, (fh * margin) / nh);
          fitZoom = Math.min(FOCUS_ZOOM, maxZ);
        }
      }
    }

    const target: Viewport = { x: activeNode.x, y: activeNode.y, zoom: fitZoom };

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
      ? Math.max(0.55, target.zoom - Math.min(0.85, dist / 1200))
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
  }, [activeId, size.w, size.h]);


  function next() {
    if (countdown !== null) return;
    setIdx((i) => Math.min(order.length - 1, i + 1));
  }
  function prev() {
    if (countdown !== null) return;
    setIdx((i) => Math.max(0, i - 1));
  }
  async function stopAndDownload() {
    if (isRecording()) {
      try {
        const r = await stopRecording();
        setResult(r);
        const a = document.createElement("a");
        a.href = r.url;
        a.download = r.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (e) {
        console.error("[presentation] stop recording", e);
      }
      return;
    }
    exit();
  }
  function exit() {
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
    // Only fullscreen when NOT recording — recording uses a windowed frame so
    // controls stay visible outside the captured area.
    if (recording) return;
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    }
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [recording]);

  useEffect(() => {
    return () => {
      if (isRecording()) cancelRecording().catch(() => {});
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isNav =
        e.key === "ArrowRight" ||
        e.key === "ArrowDown" ||
        e.key === " " ||
        e.key === "PageDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowUp" ||
        e.key === "PageUp" ||
        e.key === "Home" ||
        e.key === "End" ||
        e.key === "Escape";
      if (isNav) {
        const ae = document.activeElement as HTMLElement | null;
        if (ae && (ae.tagName === "VIDEO" || ae.closest("video"))) {
          ae.blur();
        }
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape") {
        stopAndDownload();
      } else if (e.key === "Home") {
        setIdx(0);
      } else if (e.key === "End") {
        setIdx(order.length - 1);
      } else if ((e.key === "r" || e.key === "R") && recording) {
        e.preventDefault();
        stopAndDownload();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.length, recording]);

  // Recording state ticker.
  const [, setRecTick] = useState(0);
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

  const [uiVisible, setUiVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);
  useEffect(() => {
    function bump() {
      setUiVisible(true);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      // Never auto-hide while recording — the user needs the Stop button.
      if (recording) return;
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
  }, [recording]);

  const frameStyle: React.CSSProperties = recording
    ? {
        width: frameCssSize.w,
        height: frameCssSize.h,
        boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
        borderRadius: 8,
        overflow: "hidden",
        position: "relative",
      }
    : {
        position: "absolute",
        inset: 0,
      };

  return (
    <div className="fixed inset-0 bg-background text-foreground overflow-hidden">
      {/* Recording top bar (outside frame — never captured). */}
      {recording && recState?.state === "recording" && recState.startedAt != null && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
          <RecorderHUD
            startedAt={recState.startedAt}
            onStop={stopAndDownload}
            cropped={cropOk}
          />
          {format && (
            <div className="text-[11px] font-mono text-muted-foreground bg-black/50 backdrop-blur border border-border/50 rounded-full px-3 py-1">
              {format.width}×{format.height}
            </div>
          )}
        </div>
      )}

      {/* Frame (captured region). */}
      <div
        className={recording ? "absolute inset-0 grid place-items-center" : "absolute inset-0"}
      >
        <div ref={frameRef} style={frameStyle} className="bg-background">
          <MindMapCanvas
            nodes={project.nodes}
            visibleIds={visibleIds}
            viewport={viewport}
            containerSize={size}
            colorById={colorMap}
            activeEdgeToId={activeNode?.parentId ? activeId : null}
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
                  active={n.id === litId}
                  effectiveColor={colorMap.get(n.id)}
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

          <AvatarLayer project={project} frameSize={size} />

          {countdown !== null && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none z-30">
              <div
                key={countdown}
                className="animate-scale-in text-white/90 font-semibold tabular-nums"
                style={{
                  fontSize: Math.round(Math.min(size.w, size.h) * 0.35),
                  textShadow: "0 8px 40px rgba(0,0,0,0.6)",
                  lineHeight: 1,
                }}
              >
                {countdown}
              </div>
            </div>
          )}

        </div>
      </div>


      {/* Off-frame controls — always visible during recording. */}
      <div
        className={`absolute top-4 right-4 z-10 transition-opacity duration-300 ${
          uiVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          onClick={stopAndDownload}
          className="size-10 grid place-items-center rounded-full bg-card/70 backdrop-blur border border-border/60 hover:bg-card"
          aria-label={recording ? "Parar gravação e sair" : "Sair da apresentação"}
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

      {order.length === 0 && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="text-muted-foreground">Adicione nós antes de apresentar.</p>
        </div>
      )}

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
            <video src={result.url} controls className="w-full aspect-video bg-black" />
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

function AvatarLayer({ project, frameSize }: { project: Project; frameSize: { w: number; h: number } }) {
  const avatars = useStore((s) => s.avatars);
  const usage = project.sonicAvatar;
  if (!usage?.enabled || !usage.avatarId) return null;
  const entry = avatars.find((a) => a.id === usage.avatarId);
  if (!entry) return null;
  return (
    <SonicAvatarOverlay
      avatar={entry}
      xPct={usage.xPct}
      yPct={usage.yPct}
      frameSize={frameSize}
      interactive
      onMove={(xPct, yPct) => {
        useStore.getState().setSonicAvatar(project.id, { xPct, yPct });
      }}
    />
  );
}

