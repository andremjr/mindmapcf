import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getRecordingAnalyser, getRecordingHasMic } from "@/lib/screenRecorder";

function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Recording HUD. Opens in a Document Picture-in-Picture window when supported
 * (Chrome/Edge 116+) — that window is a separate OS-level surface and is NOT
 * captured by getDisplayMedia, so the HUD stays off the recording. Falls back
 * to a draggable overlay on the page (which WILL appear in the recording).
 */
export function RecorderHUD({
  startedAt,
  onStop,
}: {
  startedAt: number;
  onStop: () => void;
}) {
  const [pipWin, setPipWin] = useState<Window | null>(null);
  const [pipAttempted, setPipAttempted] = useState(false);

  useEffect(() => {
    if (pipAttempted) return;
    setPipAttempted(true);
    const dpip = (window as any).documentPictureInPicture;
    if (!dpip) return;
    let win: Window | null = null;
    let cancelled = false;
    dpip
      .requestWindow({ width: 280, height: 96 })
      .then((w: Window) => {
        if (cancelled) {
          try {
            w.close();
          } catch {
            /* ignore */
          }
          return;
        }
        win = w;
        w.document.title = "Gravação";
        // Inline styles let us render without copying stylesheets.
        w.document.body.style.cssText =
          "margin:0;padding:0;background:transparent;font-family:ui-sans-serif,system-ui,sans-serif;color:#fff;overflow:hidden;";
        w.addEventListener("pagehide", () => setPipWin(null));
        setPipWin(w);
      })
      .catch((err: unknown) => {
        // User dismissed or the browser refused — fall back silently.
        console.warn("[RecorderHUD] documentPictureInPicture failed", err);
      });
    return () => {
      cancelled = true;
      if (win) {
        try {
          win.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, [pipAttempted]);

  const panel = <HUDPanel startedAt={startedAt} onStop={onStop} inPip={!!pipWin} />;

  if (pipWin) return createPortal(panel, pipWin.document.body);
  return <DraggableWrapper>{panel}</DraggableWrapper>;
}

function DraggableWrapper({ children }: { children: ReactNode }) {
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 260, e.clientX - dragRef.current.ox)),
      y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragRef.current.oy)),
    });
  }
  function onPointerUp(e: React.PointerEvent) {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 60,
        touchAction: "none",
        cursor: "grab",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {children}
    </div>
  );
}

function HUDPanel({
  startedAt,
  onStop,
  inPip,
}: {
  startedAt: number;
  onStop: () => void;
  inPip: boolean;
}) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = now - startedAt;

  const containerStyle: CSSProperties = inPip
    ? {
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        height: "100%",
        padding: "0 12px",
        boxSizing: "border-box",
        background:
          "linear-gradient(180deg, rgba(20,20,24,0.98) 0%, rgba(12,12,16,0.98) 100%)",
        color: "#fafafa",
        userSelect: "none",
      }
    : {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 999,
        background: "rgba(18,18,22,0.72)",
        backdropFilter: "blur(16px) saturate(140%)",
        border: "1px solid rgba(239,68,68,0.45)",
        color: "#fafafa",
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
        fontSize: 13,
        userSelect: "none",
        opacity: 0.9,
      };

  return (
    <div style={containerStyle}>
      <RecDot />
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          fontVariantNumeric: "tabular-nums",
          fontSize: 14,
          fontWeight: 600,
          minWidth: 54,
        }}
      >
        {formatDuration(elapsed)}
      </div>
      <AudioMeter />
      <button
        onClick={(e) => {
          e.stopPropagation();
          onStop();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        title="Parar gravação (R)"
        aria-label="Parar gravação"
        style={{
          marginLeft: "auto",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 10px",
          borderRadius: 999,
          background: "#ef4444",
          color: "#fff",
          border: "none",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            background: "#fff",
            borderRadius: 1,
          }}
        />
        Parar
      </button>
    </div>
  );
}

function RecDot() {
  return (
    <>
      <style>{`@keyframes rec-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }`}</style>
      <span
        style={{
          display: "inline-block",
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: "#ef4444",
          boxShadow: "0 0 10px rgba(239,68,68,0.7)",
          animation: "rec-pulse 1.2s ease-in-out infinite",
          flexShrink: 0,
        }}
      />
    </>
  );
}

function AudioMeter() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasMic, setHasMic] = useState<boolean>(() => getRecordingHasMic());

  useEffect(() => {
    setHasMic(getRecordingHasMic());
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // High-DPI scaling
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = 90;
    const cssH = 24;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    ctx.scale(dpr, dpr);

    let raf = 0;
    const analyser = getRecordingAnalyser();
    const buffer = analyser ? new Uint8Array(analyser.fftSize) : null;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, cssW, cssH);

      if (!analyser || !buffer) {
        // No signal → flat dim line
        ctx.strokeStyle = "rgba(148,163,184,0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, cssH / 2);
        ctx.lineTo(cssW, cssH / 2);
        ctx.stroke();
      } else {
        analyser.getByteTimeDomainData(buffer);
        // Peak level (0..1) drives glow intensity
        let peak = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = Math.abs(buffer[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        const active = peak > 0.02;
        ctx.strokeStyle = active ? "#22d3ee" : "rgba(148,163,184,0.55)";
        ctx.lineWidth = 1.5;
        ctx.shadowColor = active ? "rgba(34,211,238,0.9)" : "transparent";
        ctx.shadowBlur = active ? 4 : 0;
        ctx.beginPath();
        const step = buffer.length / cssW;
        for (let x = 0; x < cssW; x++) {
          const sample = buffer[Math.floor(x * step)];
          const y = ((sample - 128) / 128) * (cssH / 2 - 2) + cssH / 2;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 2px",
      }}
      title={hasMic ? "Microfone" : "Áudio do sistema"}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
