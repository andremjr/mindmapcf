import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, X, Download } from "lucide-react";
import type { Project } from "@/lib/types";
import {
  isRecording, stopRecording, cancelRecording, getRecorderState, subscribeRecorder,
  cropRecordingToElement, beginArmedRecording, getRecordingNarrationEl, type RecordingResult,
} from "@/lib/screenRecorder";
import { loadRecordFormat, defaultRecordFormat, type RecordFormat } from "@/lib/recordFormats";
import { RecorderHUD } from "@/components/mindmap/RecorderHUD";
import { ThemeToggle } from "@/components/ThemeToggle";

function fmtDur(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Shared fullscreen shell used by Tier List / Iceberg-style presentations.
 * Handles: fullscreen entry, record crop + countdown + HUD, exit + download,
 * arrow-key / Space navigation. Child renders the actual frame content.
 */
export function PresentationShell({
  project,
  recording,
  navLabel,
  onNext,
  onPrev,
  canNext,
  canPrev,
  frameBg = "bg-neutral-950",
  children,
}: {
  project: Project;
  recording: boolean;
  navLabel: string;
  onNext: () => void;
  onPrev: () => void;
  canNext: boolean;
  canPrev: boolean;
  frameBg?: string;
  children: (ctx: { size: { w: number; h: number }; countdown: number | null }) => React.ReactNode;
}) {
  const navigate = useNavigate();
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1280, h: 720 });
  const [result, setResult] = useState<RecordingResult | null>(null);
  const [cropOk, setCropOk] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [winSize, setWinSize] = useState({
    w: typeof window !== "undefined" ? window.innerWidth : 1280,
    h: typeof window !== "undefined" ? window.innerHeight : 720,
  });
  useEffect(() => {
    const onResize = () => setWinSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const format: RecordFormat | null = recording
    ? loadRecordFormat(project.id) ?? defaultRecordFormat()
    : null;
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

  useEffect(() => {
    if (!recording || !frameRef.current) return;
    let cancelled = false;
    cropRecordingToElement(frameRef.current).then((ok) => {
      if (cancelled) return;
      setCropOk(ok);
      if (!ok) {
        cancelRecording().catch(() => undefined);
        window.alert("Não foi possível recortar o quadro. Use Chrome/Edge no desktop.");
        navigate({ to: "/projects/$id", params: { id: project.id } });
      }
    });
    return () => { cancelled = true; };
  }, [recording, navigate, project.id]);

  useEffect(() => {
    if (!recording || !cropOk) return;
    setCountdown(3);
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setCountdown(2), 1000));
    timers.push(window.setTimeout(() => setCountdown(1), 2000));
    timers.push(window.setTimeout(() => {
      setCountdown(null);
      try {
        beginArmedRecording();
        const narr = getRecordingNarrationEl();
        if (narr) { narr.currentTime = 0; narr.play().catch(() => undefined); }
      } catch (e) { console.error(e); }
    }, 3000));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [recording, cropOk]);

  async function stopAndDownload() {
    const narr = getRecordingNarrationEl();
    if (narr) { try { narr.pause(); } catch { /* ignore */ } }
    if (isRecording()) {
      try {
        const r = await stopRecording();
        setResult(r);
        const a = document.createElement("a");
        a.href = r.url; a.download = r.filename;
        document.body.appendChild(a); a.click(); a.remove();
      } catch (e) { console.error(e); }
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
    exit();
  }

  useEffect(() => {
    if (recording) return;
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    return () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, [recording]);

  useEffect(() => () => { if (isRecording()) cancelRecording().catch(() => {}); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (countdown !== null) return;
      if (["ArrowRight", "ArrowDown", " ", "PageDown"].includes(e.key)) { e.preventDefault(); onNext(); }
      else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); onPrev(); }
      else if (e.key === "Escape") stopAndDownload();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, onNext, onPrev]);

  const [, setRecTick] = useState(0);
  useEffect(() => {
    if (!recording) return;
    const unsub = subscribeRecorder(() => setRecTick((n) => n + 1));
    const iv = window.setInterval(() => setRecTick((n) => n + 1), 500);
    return () => { unsub(); window.clearInterval(iv); };
  }, [recording]);
  const recState = recording ? getRecorderState() : null;

  const frameStyle: React.CSSProperties = recording
    ? { width: frameCssSize.w, height: frameCssSize.h, boxShadow: "0 30px 80px rgba(0,0,0,0.7)", borderRadius: 8, overflow: "hidden", position: "relative" }
    : { position: "absolute", inset: 0 };

  return (
    <div className="fixed inset-0 bg-neutral-950 text-white overflow-hidden">
      {recording && recState?.state === "recording" && recState.startedAt != null && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
          <RecorderHUD startedAt={recState.startedAt} onStop={stopAndDownload} cropped={cropOk} />
        </div>
      )}

      <div className={recording ? "absolute inset-0 grid place-items-center" : "absolute inset-0"}>
        <div ref={frameRef} style={frameStyle} className={frameBg}>
          {children({ size, countdown })}
          {countdown !== null && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none z-30">
              <div
                key={countdown}
                className="animate-scale-in text-white/90 font-semibold tabular-nums"
                style={{ fontSize: Math.round(Math.min(size.w, size.h) * 0.35), textShadow: "0 8px 40px rgba(0,0,0,0.6)", lineHeight: 1 }}
              >{countdown}</div>
            </div>
          )}
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {!recording && <ThemeToggle />}
        <button onClick={stopAndDownload} className="size-10 grid place-items-center rounded-full bg-black/70 backdrop-blur border border-white/20 hover:bg-black/90 text-white">
          <X className="size-4" />
        </button>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-black/70 backdrop-blur border border-white/20 px-2 py-2">
        <button onClick={onPrev} disabled={!canPrev} className="size-9 grid place-items-center rounded-full hover:bg-white/10 disabled:opacity-40">
          <ChevronLeft className="size-5" />
        </button>
        <span className="px-3 text-sm font-mono tabular-nums min-w-[70px] text-center">{navLabel}</span>
        <button onClick={onNext} disabled={!canNext} className="size-9 grid place-items-center rounded-full hover:bg-white/10 disabled:opacity-40">
          <ChevronRight className="size-5" />
        </button>
      </div>

      {result && (
        <div className="absolute inset-0 z-30 bg-black/90 backdrop-blur grid place-items-center p-6">
          <div className="w-full max-w-2xl rounded-2xl border border-white/20 bg-neutral-900 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Gravação finalizada</h2>
                <p className="text-xs text-white/60 mt-0.5">
                  {result.mimeType} · {fmtDur(result.durationMs)} · {(result.blob.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              <button onClick={closeResult} className="size-8 grid place-items-center rounded-full hover:bg-white/10">
                <X className="size-4" />
              </button>
            </div>
            <video src={result.url} controls className="w-full aspect-video bg-black" />
            <div className="px-6 py-4 flex items-center justify-end gap-2">
              <button onClick={closeResult} className="px-3 py-2 text-sm rounded-md hover:bg-white/10">Fechar</button>
              <a href={result.url} download={result.filename} className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-white text-black hover:opacity-90">
                <Download className="size-4" /> Baixar novamente
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
