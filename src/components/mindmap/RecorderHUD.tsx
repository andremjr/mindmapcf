import { useEffect, useRef, useState } from "react";
import { getRecordingAnalyser, getRecordingHasMic } from "@/lib/screenRecorder";

/**
 * Inline recording HUD. Rendered outside the captured frame (Region Capture
 * crops the video track to the frame element), so it can safely live in the
 * regular DOM without leaking into the video.
 */
export function RecorderHUD({
  startedAt,
  onStop,
  cropped,
}: {
  startedAt: number;
  onStop: () => void;
  /** true when Region Capture is active — HUD is guaranteed off-frame. */
  cropped: boolean;
}) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = now - startedAt;
  const mm = String(Math.floor(elapsed / 60000)).padStart(2, "0");
  const ss = String(Math.floor((elapsed / 1000) % 60)).padStart(2, "0");

  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-red-500/50 bg-black/80 backdrop-blur px-3 py-2 shadow-2xl select-none">
      <RecDot />
      <span className="font-mono tabular-nums text-sm font-semibold text-white min-w-[54px]">
        {mm}:{ss}
      </span>
      <AudioMeter />
      {!cropped && (
        <span
          className="text-[10px] uppercase tracking-wider text-amber-300"
          title="Este navegador não suporta Region Capture — o HUD será capturado. Use Chrome/Edge para gravar somente o quadro."
        >
          full-tab
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onStop();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        title="Parar gravação (R)"
        aria-label="Parar gravação"
        className="inline-flex items-center gap-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-semibold px-3 py-1.5 transition"
      >
        <span className="inline-block w-2 h-2 bg-white rounded-[1px]" />
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
        className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 shrink-0"
        style={{
          boxShadow: "0 0 10px rgba(239,68,68,0.7)",
          animation: "rec-pulse 1.2s ease-in-out infinite",
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
        ctx.strokeStyle = "rgba(148,163,184,0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, cssH / 2);
        ctx.lineTo(cssW, cssH / 2);
        ctx.stroke();
      } else {
        analyser.getByteTimeDomainData(buffer);
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
    <div className="flex items-center px-0.5" title={hasMic ? "Microfone" : "Áudio do sistema"}>
      <canvas ref={canvasRef} />
    </div>
  );
}
