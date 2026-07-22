import { useEffect, useRef, useState } from "react";
import type { SonicAvatarEntry } from "@/lib/types";
import { getRecordingAnalyser } from "@/lib/screenRecorder";
import { getMicAnalyser } from "@/lib/micAnalyser";
import { resolveImage } from "@/lib/imageStorage";

/**
 * Draggable circular avatar with animated sound waves.
 * Rendered INSIDE the recording frame so it enters the captured video.
 * Position and size are in % of the frame, resolution-independent.
 */
export function SonicAvatarOverlay({
  avatar,
  xPct,
  yPct,
  frameSize,
  onMove,
  interactive,
}: {
  avatar: SonicAvatarEntry;
  xPct: number;
  yPct: number;
  frameSize: { w: number; h: number };
  onMove: (xPct: number, yPct: number) => void;
  /** Allow drag. During plain presentation (no recording) we still show it if enabled. */
  interactive: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  // Resolve the image ref → object URL.
  useEffect(() => {
    let cancelled = false;
    if (!avatar.imageRef) {
      setImgUrl(null);
      return;
    }
    resolveImage(avatar.imageRef).then((url) => {
      if (!cancelled) setImgUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [avatar.imageRef?.id, avatar.imageRef?.localPath, avatar.imageRef?.storagePath, avatar.imageRef?.bucket]);

  // Diameter in px, based on shorter side of the frame.
  const minSide = Math.min(frameSize.w, frameSize.h);
  const diameter = Math.max(40, (minSide * avatar.sizePct) / 100);
  const centerX = (frameSize.w * xPct) / 100;
  const centerY = (frameSize.h * yPct) / 100;

  // Sound-wave canvas (bars radiating around the circle).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c = ctx;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // Canvas is 1.6× the diameter → room for bars around the circle.
    const cssSize = diameter * 1.6;
    canvas.width = cssSize * dpr;
    canvas.height = cssSize * dpr;
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    c.scale(dpr, dpr);


    const cx = cssSize / 2;
    const cy = cssSize / 2;
    const innerR = diameter / 2 + 4; // just outside the circle
    const maxBarLen = (cssSize / 2 - innerR) * 0.95;
    const BARS = 64;

    let raf = 0;
    const smooth = new Float32Array(BARS);

    function frame() {
      const analyser = getRecordingAnalyser() ?? getMicAnalyser();
      c.clearRect(0, 0, cssSize, cssSize);
      let data: Uint8Array | null = null;
      if (analyser) {
        const buf = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(buf as unknown as Uint8Array<ArrayBuffer>);
        data = buf;
      }
      c.strokeStyle = avatar.waveColor;
      c.lineCap = "round";
      c.lineWidth = Math.max(2, diameter * 0.02);
      c.shadowColor = avatar.waveColor;
      c.shadowBlur = 6;
      for (let i = 0; i < BARS; i++) {
        // Sample: use log-ish index bias for a nicer spread.
        let v = 0;
        if (data) {
          const idx = Math.floor((i / BARS) * data.length * 0.7);
          v = data[idx] / 255;
        } else {
          // Idle animation when no analyser (preview/no audio yet).
          v = 0.12 + 0.08 * Math.sin(performance.now() / 400 + i * 0.4);
        }
        smooth[i] = smooth[i] * 0.75 + v * 0.25;
        const len = Math.max(3, smooth[i] * maxBarLen);
        const angle = (i / BARS) * Math.PI * 2 - Math.PI / 2;
        const x0 = cx + Math.cos(angle) * innerR;
        const y0 = cy + Math.sin(angle) * innerR;
        const x1 = cx + Math.cos(angle) * (innerR + len);
        const y1 = cy + Math.sin(angle) * (innerR + len);
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(x1, y1);
        c.stroke();
      }
      c.shadowBlur = 0;
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [diameter, avatar.waveColor]);

  // Drag handling.
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startXPct: number;
    startYPct: number;
  } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (!interactive) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startXPct: xPct,
      startYPct: yPct,
    };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    e.preventDefault();
    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;
    // frame element size in *screen* px:
    const rect = rootRef.current?.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const nx = d.startXPct + (dx / rect.width) * 100;
    const ny = d.startYPct + (dy / rect.height) * 100;
    const halfW = (diameter / rect.width) * 100 * 0.5;
    const halfH = (diameter / rect.height) * 100 * 0.5;
    const clampedX = Math.max(halfW, Math.min(100 - halfW, nx));
    const clampedY = Math.max(halfH, Math.min(100 - halfH, ny));
    onMove(clampedX, clampedY);
  }
  function onPointerUp(e: React.PointerEvent) {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }

  return (
    <div
      ref={rootRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "absolute",
        left: centerX,
        top: centerY,
        transform: "translate(-50%, -50%)",
        width: diameter * 1.6,
        height: diameter * 1.6,
        touchAction: "none",
        cursor: interactive ? "grab" : "default",
        userSelect: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: diameter,
          height: diameter,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: avatar.bgColor,
          overflow: "hidden",
          boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
          display: "grid",
          placeItems: "center",
        }}
      >
        {imgUrl ? (
          <img
            src={imgUrl}
            alt=""
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              pointerEvents: "none",
            }}
          />
        ) : (
          <span
            style={{
              fontSize: Math.max(10, diameter * 0.09),
              color: "rgba(255,255,255,0.7)",
              padding: 8,
              textAlign: "center",
            }}
          >
            sem imagem
          </span>
        )}
      </div>
    </div>
  );
}
