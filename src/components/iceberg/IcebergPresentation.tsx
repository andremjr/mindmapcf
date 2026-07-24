import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, X, Download } from "lucide-react";
import type { MindNode, Project } from "@/lib/types";
import { resolveImage } from "@/lib/imageStorage";
import {
  isRecording,
  stopRecording,
  cancelRecording,
  getRecorderState,
  subscribeRecorder,
  cropRecordingToElement,
  beginArmedRecording,
  getRecordingNarrationEl,
  type RecordingResult,
} from "@/lib/screenRecorder";
import { loadRecordFormat, defaultRecordFormat, type RecordFormat } from "@/lib/recordFormats";
import { RecorderHUD } from "@/components/mindmap/RecorderHUD";
import { ThemeToggle } from "@/components/ThemeToggle";
import { resolveEmbed } from "@/lib/embedUrl";
import { AvatarLayer } from "@/components/shared/AvatarLayer";

function fmtDur(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function useResolvedImage(node: MindNode | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const key = node?.imageRef?.id ?? node?.image ?? "";
  useEffect(() => {
    if (!node) return setUrl(null);
    if (node.image) return setUrl(node.image);
    if (!node.imageRef) return setUrl(null);
    let alive = true;
    resolveImage(node.imageRef).then((u) => alive && setUrl(u));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

function ItemTile({ node, active, onClick, scatter }: { node: MindNode; active: boolean; onClick: () => void; scatter?: { left: string; top: string; rotate: number; size: number } }) {
  const url = useResolvedImage(node);
  const style: React.CSSProperties = scatter
    ? {
        position: "absolute",
        left: scatter.left,
        top: scatter.top,
        width: scatter.size,
        height: scatter.size,
        transform: `translate(-50%,-50%) rotate(${scatter.rotate}deg)${active ? " scale(1.12)" : ""}`,
        background: "rgba(0,0,0,0.5)",
        zIndex: active ? 5 : 1,
      }
    : { width: 104, height: 104, background: "rgba(0,0,0,0.5)" };
  return (
    <button
      onClick={onClick}
      className={`rounded-md border overflow-hidden shrink-0 transition-all duration-300 ${
        active
          ? "ring-2 ring-primary/80 shadow-[0_0_30px_hsl(var(--primary)/0.35)] border-primary/60"
          : "border-foreground/30 hover:border-foreground/60"
      }`}
      style={style}
    >
      {url ? (
        <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-[10px] text-center px-1 leading-tight text-foreground/90">
          {node.text || "Item"}
        </div>
      )}
    </button>
  );
}

/** Deterministic pseudo-random in [0,1) from a string seed. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}


export function IcebergPresentation({
  project,
  recording = false,
}: {
  project: Project;
  recording?: boolean;
}) {
  const navigate = useNavigate();
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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

  // Structure
  const root = project.nodes.find((n) => n.role === "iceberg" || !n.parentId);
  const levels = useMemo(
    () => project.nodes
      .filter((n) => n.role === "level" && n.parentId === root?.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [project.nodes, root?.id],
  );
  const itemsByLevel = useMemo(() => {
    const m = new Map<string, MindNode[]>();
    for (const l of levels) m.set(l.id, []);
    for (const n of project.nodes) {
      if (n.role !== "item") continue;
      if (n.parentId && m.has(n.parentId)) m.get(n.parentId)!.push(n);
    }
    return m;
  }, [project.nodes, levels]);

  /** Nav order: [level1, item1a, item1b, level2, item2a, ...] */
  const nav = useMemo(() => {
    const arr: Array<{ type: "level" | "item"; levelId: string; itemId?: string }> = [];
    for (const lvl of levels) {
      arr.push({ type: "level", levelId: lvl.id });
      for (const it of itemsByLevel.get(lvl.id) ?? []) {
        arr.push({ type: "item", levelId: lvl.id, itemId: it.id });
      }
    }
    return arr;
  }, [levels, itemsByLevel]);

  const [idx, setIdx] = useState(0);
  const [itemOpen, setItemOpen] = useState(false);
  const current = nav[idx];
  const activeItem = current?.itemId && itemOpen
    ? project.nodes.find((n) => n.id === current.itemId) ?? null
    : null;

  // Cinematic zoom: on level change, briefly zoom out to show the whole
  // iceberg, then zoom in to the target level.
  const [phase, setPhase] = useState<"focus" | "overview">("focus");
  const prevLevelIdRef = useRef<string | null>(null);
  const levelIndex = useMemo(
    () => (current ? levels.findIndex((l) => l.id === current.levelId) : 0),
    [levels, current?.levelId],
  );
  useEffect(() => {
    if (!current) return;
    const prev = prevLevelIdRef.current;
    if (prev !== null && prev !== current.levelId) {
      setPhase("overview");
      const t = window.setTimeout(() => setPhase("focus"), 900);
      prevLevelIdRef.current = current.levelId;
      return () => window.clearTimeout(t);
    }
    prevLevelIdRef.current = current.levelId;
  }, [current?.levelId]);

  const next = () => {
    if (countdown !== null) return;
    // Two-click per item: 1st opens the card, 2nd closes it and moves on.
    if (current?.type === "item" && !itemOpen) { setItemOpen(true); return; }
    setItemOpen(false);
    setIdx((i) => Math.min(nav.length - 1, i + 1));
  };
  const prev = () => {
    if (countdown !== null) return;
    if (current?.type === "item" && itemOpen) { setItemOpen(false); return; }
    setItemOpen(false);
    setIdx((i) => Math.max(0, i - 1));
  };

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
      if (["ArrowRight","ArrowDown"," ","PageDown"].includes(e.key)) { e.preventDefault(); next(); }
      else if (["ArrowLeft","ArrowUp","PageUp"].includes(e.key)) { e.preventDefault(); prev(); }
      else if (e.key === "Escape") stopAndDownload();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.length, recording]);

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

  const GRADS = [
    { from: "#7dd3fc", to: "#38bdf8", text: "#0f172a" },
    { from: "#0ea5e9", to: "#0369a1", text: "#f8fafc" },
    { from: "#0369a1", to: "#0c1e3a", text: "#f8fafc" },
    { from: "#0c1e3a", to: "#020617", text: "#f8fafc" },
    { from: "#020617", to: "#000000", text: "#f8fafc" },
  ];

  return (
    <div className="fixed inset-0 bg-background text-foreground overflow-hidden">
      {recording && recState?.state === "recording" && recState.startedAt != null && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
          <RecorderHUD startedAt={recState.startedAt} onStop={stopAndDownload} cropped={cropOk} />
        </div>
      )}

      <div className={recording ? "absolute inset-0 grid place-items-center" : "absolute inset-0"}>
        <div ref={frameRef} style={frameStyle} className="bg-background">
          <AvatarLayer project={project} frameSize={size} />
          {/* Zoom stack — one screen per level, transformed to focus/overview */}
          {(() => {
            const N = Math.max(1, levels.length);
            const levelH = size.h;
            const totalH = levelH * N;
            const scale = phase === "overview" ? 1 / N : 1;
            const tY = phase === "overview" ? 0 : -levelIndex * levelH;
            const tX = phase === "overview" ? (size.w * (1 - 1 / N)) / 2 : 0;
            return (
              <div ref={scrollRef} className="absolute inset-0 overflow-hidden">
                <div
                  className="absolute top-0 left-0"
                  style={{
                    width: size.w,
                    height: totalH,
                    transform: `translate(${tX}px, ${tY}px) scale(${scale})`,
                    transformOrigin: "top left",
                    transition: "transform 900ms cubic-bezier(0.65, 0, 0.35, 1)",
                    willChange: "transform",
                  }}
                >
                  <IcebergArt levels={N} />
                  {levels.map((lvl, i) => {
                    const grad = GRADS[Math.min(i, GRADS.length - 1)];
                    const items = itemsByLevel.get(lvl.id) ?? [];
                    const isActive = current?.levelId === lvl.id;
                    return (
                      <div
                        key={lvl.id}
                        data-level-id={lvl.id}
                        className={`relative px-10 py-10 flex flex-col gap-6 transition-opacity duration-500 ${
                          phase === "overview" || isActive ? "opacity-100" : "opacity-40"
                        }`}
                        style={{
                          background: `linear-gradient(180deg, ${grad.from}cc 0%, ${grad.to}cc 100%)`,
                          color: grad.text,
                          height: levelH,
                        }}
                      >
                        <div
                          className="font-bold text-3xl md:text-4xl relative z-10 text-center"
                          style={{ textShadow: "0 2px 12px rgba(0,0,0,0.55)" }}
                        >
                          {lvl.text}
                        </div>
                        <div className="relative z-10 flex-1 w-full">
                          {items.map((it, k) => {
                            const n = items.length;
                            const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt(n * 1.8))));
                            const rows = Math.ceil(n / cols);
                            const col = k % cols;
                            const row = Math.floor(k / cols);
                            const slotW = 84 / cols;
                            const slotH = 80 / rows;
                            const jitterX = (seeded(it.id + "x") - 0.5) * slotW * 0.35;
                            const jitterY = (seeded(it.id + "y") - 0.5) * slotH * 0.35;
                            const leftPct = 8 + slotW * (col + 0.5) + jitterX;
                            const topPct = 10 + slotH * (row + 0.5) + jitterY;
                            const rotate = (seeded(it.id + "r") - 0.5) * 16;
                            const tileSize = 100 + Math.round(seeded(it.id + "s") * 20);
                            return (
                              <ItemTile
                                key={it.id}
                                node={it}
                                active={activeItem?.id === it.id}
                                onClick={() => {
                                  const j = nav.findIndex((x) => x.itemId === it.id);
                                  if (j >= 0) setIdx(j);
                                }}
                                scatter={{ left: `${leftPct}%`, top: `${topPct}%`, rotate, size: tileSize }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}


          {/* Item card overlay */}
          {activeItem && <ItemCard node={activeItem} onClose={() => {
            // step back to the level entry
            const j = nav.findIndex((x) => x.type === "level" && x.levelId === current!.levelId);
            if (j >= 0) setIdx(j);
          }} />}

          {countdown !== null && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none z-30">
              <div
                key={countdown}
                className="animate-scale-in text-foreground/90 font-semibold tabular-nums"
                style={{ fontSize: Math.round(Math.min(size.w, size.h) * 0.35), textShadow: "0 8px 40px rgba(0,0,0,0.6)", lineHeight: 1 }}
              >{countdown}</div>
            </div>
          )}
        </div>
      </div>

      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        {!recording && <ThemeToggle />}
        <button onClick={stopAndDownload} className="size-10 grid place-items-center rounded-full bg-foreground/10 backdrop-blur border border-border hover:bg-foreground/20 text-foreground">
          <X className="size-4" />
        </button>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-foreground/10 backdrop-blur border border-border text-foreground px-2 py-2">
        <button onClick={prev} disabled={idx === 0} className="size-9 grid place-items-center rounded-full hover:bg-foreground/10 disabled:opacity-40">
          <ChevronLeft className="size-5" />
        </button>
        <span className="px-3 text-sm font-mono tabular-nums min-w-[70px] text-center">
          {nav.length > 0 ? `${idx + 1} / ${nav.length}` : "0 / 0"}
        </span>
        <button onClick={next} disabled={idx >= nav.length - 1} className="size-9 grid place-items-center rounded-full hover:bg-foreground/10 disabled:opacity-40">
          <ChevronRight className="size-5" />
        </button>
      </div>

      {nav.length === 0 && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="text-muted-foreground">Adicione níveis e itens antes de apresentar.</p>
        </div>
      )}

      {result && (
        <div className="absolute inset-0 z-30 bg-background/95 backdrop-blur grid place-items-center p-6">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Gravação finalizada</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {result.mimeType} · {fmtDur(result.durationMs)} · {(result.blob.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              <button onClick={closeResult} className="size-8 grid place-items-center rounded-full hover:bg-foreground/10">
                <X className="size-4" />
              </button>
            </div>
            <video src={result.url} controls className="w-full aspect-video bg-black" />
            <div className="px-6 py-4 flex items-center justify-end gap-2">
              <button onClick={closeResult} className="px-3 py-2 text-sm rounded-md hover:bg-foreground/10">Fechar</button>
              <a href={result.url} download={result.filename} className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90">
                <Download className="size-4" /> Baixar novamente
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemCard({ node, onClose }: { node: MindNode; onClose: () => void }) {
  const url = useResolvedImage(node);
  const isVideo = node.imageRef?.kind === "video";
  const embed = node.url ? resolveEmbed(node.url) : null;
  return (
    <div className="absolute inset-0 z-20 grid place-items-center p-6 pointer-events-none">
      <div className="pointer-events-auto max-w-3xl w-auto max-h-[85%] rounded-xl border border-border bg-card/95 text-card-foreground backdrop-blur-md shadow-2xl overflow-hidden animate-scale-in flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="text-lg font-semibold truncate">{node.text || "Item"}</div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-white/10 shrink-0">
            <X className="size-4" />
          </button>
        </div>
        {url && !isVideo && (
          <div className="bg-black flex items-center justify-center overflow-hidden">
            <img src={url} alt="" className="block max-w-full max-h-[60vh] w-auto h-auto object-contain" />
          </div>
        )}
        {url && isVideo && (
          <div className="bg-black flex items-center justify-center">
            <video src={url} controls autoPlay className="block max-w-full max-h-[60vh] w-auto h-auto" />
          </div>
        )}
        {!url && embed && (
          <div className="bg-black w-[720px] max-w-full aspect-video">
            <iframe src={embed.embedUrl} className="w-full h-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
          </div>
        )}
        {node.body && (
          <div className="p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 overflow-auto">{node.body}</div>
        )}
        {!node.body && !url && !embed && (
          <div className="p-6 text-sm text-muted-foreground italic">Sem conteúdo. Edite o item para adicionar texto ou imagem.</div>
        )}
      </div>
    </div>
  );
}

/** Full-height background: iceberg silhouette + depth-based sea creatures.
 *  Line-only silhouettes drift across each level to add subtle motion. */
function IcebergArt({ levels }: { levels: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes drift-r { from { transform: translateX(-30%); } to { transform: translateX(130%); } }
        @keyframes drift-l { from { transform: translateX(130%); } to { transform: translateX(-30%); } }
        @keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes glow { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
      `}</style>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ig" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.9" />
            <stop offset="35%" stopColor="#bae6fd" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#0c1e3a" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <polygon points="42,3 58,6 68,12 62,17 74,19 30,19 36,14" fill="url(#ig)" opacity="0.5" />
        <polygon points="30,19 74,19 88,44 80,72 55,96 24,88 14,60 20,32" fill="url(#ig)" opacity="0.28" />
        <path d="M40 22 L46 55 L42 90" stroke="#fff" strokeOpacity="0.12" strokeWidth="0.2" fill="none" />
        <path d="M60 22 L58 50 L64 85" stroke="#fff" strokeOpacity="0.12" strokeWidth="0.2" fill="none" />
      </svg>
      {Array.from({ length: Math.max(0, levels) }).map((_, levelIdx) => {
        const depthRatio = levels > 1 ? levelIdx / (levels - 1) : 0;
        // Depth ladder: fish → crab → octopus → anglerfish
        let variant: CreatureVariant = "fish";
        if (depthRatio > 0.75) variant = "angler";
        else if (depthRatio > 0.5) variant = "octopus";
        else if (depthRatio > 0.25) variant = "crab";
        // Dark strokes contrast on the light top level, light strokes on deep dark.
        const stroke = depthRatio < 0.3 ? "#0b1f3a" : "#e2e8f0";
        const opacity = variant === "angler" ? 0.55 : depthRatio < 0.3 ? 0.5 : 0.4;

        // 5-6 creatures per level with pseudo-random directions/delays/y-offsets.
        const count = variant === "angler" ? 4 : 6;
        const creatures = Array.from({ length: count }).map((__, k) => {
          const s1 = seeded(`${levelIdx}-${k}-a`);
          const s2 = seeded(`${levelIdx}-${k}-b`);
          const s3 = seeded(`${levelIdx}-${k}-c`);
          return {
            key: `${levelIdx}-${k}`,
            dir: s1 > 0.5 ? "r" : "l" as "r" | "l",
            delay: -s2 * 40,           // negative delay → staggered starts, no gap on load
            duration: 34 + s3 * 30,    // 34-64s slow drift
            yPct: 8 + s1 * 82,         // vertical offset inside the level band (%)
            scale: 0.85 + s2 * 0.45,
          };
        });

        return (
          <div
            key={levelIdx}
            className="absolute left-0 right-0"
            style={{
              top: `${(levelIdx / levels) * 100}%`,
              height: `${(1 / levels) * 100}%`,
            }}
          >
            {creatures.map((c) => (
              <Creature
                key={c.key}
                variant={variant}
                dir={c.dir}
                delay={c.delay}
                duration={c.duration}
                yPct={c.yPct}
                scale={c.scale}
                stroke={stroke}
                opacity={opacity}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

type CreatureVariant = "fish" | "crab" | "octopus" | "angler";

function Creature({
  variant,
  dir,
  delay,
  duration,
  yPct,
  scale,
  stroke,
  opacity,
}: {
  variant: CreatureVariant;
  dir: "l" | "r";
  delay: number;
  duration: number;
  yPct: number;
  scale: number;
  stroke: string;
  opacity: number;
}) {
  const baseSize = variant === "angler" ? 78 : variant === "octopus" ? 68 : variant === "crab" ? 60 : 52;
  const size = Math.round(baseSize * scale);
  const sw = 1.2;
  return (
    <div
      className="absolute left-0 right-0"
      style={{
        top: `${yPct}%`,
        opacity,
        animation: `${dir === "r" ? "drift-r" : "drift-l"} ${duration}s linear ${delay}s infinite`,
      }}
    >
      <div style={{ width: size, height: size, animation: "bob 3.2s ease-in-out infinite" }}>
        <div style={{ transform: dir === "l" ? "scaleX(-1)" : undefined, transformOrigin: "center" }}>
          {variant === "fish" && (
            <svg viewBox="0 0 32 18" width={size} height={size * 0.6} fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round">
              <path d="M2 9 Q10 -1 22 3 Q28 9 22 15 Q10 19 2 9 Z" />
              <polyline points="22,3 30,0 26,9 30,18 22,15" />
              <circle cx="10" cy="7" r="0.9" fill={stroke} stroke="none" />
            </svg>
          )}
          {variant === "crab" && (
            <svg viewBox="0 0 40 26" width={size} height={size * 0.7} fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round">
              <ellipse cx="20" cy="16" rx="10" ry="6" />
              <line x1="16" y1="10" x2="15" y2="6" />
              <line x1="24" y1="10" x2="25" y2="6" />
              <circle cx="15" cy="5" r="1" fill={stroke} stroke="none" />
              <circle cx="25" cy="5" r="1" fill={stroke} stroke="none" />
              <path d="M10 15 Q3 12 4 8 Q7 9 8 12" />
              <path d="M30 15 Q37 12 36 8 Q33 9 32 12" />
              <path d="M12 19 L7 24" />
              <path d="M15 21 L12 25" />
              <path d="M25 21 L28 25" />
              <path d="M28 19 L33 24" />
            </svg>
          )}
          {variant === "octopus" && (
            <svg viewBox="0 0 40 40" width={size} height={size} fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round">
              <path d="M10 16 Q10 4 20 4 Q30 4 30 16 Q30 22 24 24 L16 24 Q10 22 10 16 Z" />
              <circle cx="16" cy="14" r="0.9" fill={stroke} stroke="none" />
              <circle cx="24" cy="14" r="0.9" fill={stroke} stroke="none" />
              <path d="M12 22 Q9 30 13 38" />
              <path d="M17 24 Q15 32 18 39" />
              <path d="M22 24 Q25 32 22 39" />
              <path d="M28 22 Q31 30 27 38" />
              <path d="M14 23 Q11 34 6 36" />
              <path d="M26 23 Q29 34 34 36" />
            </svg>
          )}
          {variant === "angler" && (
            <div className="relative">
              <svg viewBox="0 0 44 22" width={size} height={size * 0.55} fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round">
                <path d="M6 11 Q16 0 32 4 Q38 11 32 18 Q16 22 6 11 Z" />
                <polyline points="32,4 42,0 36,11 42,22 32,18" />
                <path d="M8 12 L10 14 L12 12 L14 14 L16 12" />
                <circle cx="16" cy="8" r="1" fill={stroke} stroke="none" />
                <path d="M12 6 Q6 -4 16 -6" />
              </svg>
              <span
                className="absolute rounded-full"
                style={{
                  left: size * 0.32,
                  top: -size * 0.32,
                  width: size * 0.22,
                  height: size * 0.22,
                  background: "radial-gradient(circle,#fde68a,#f59e0b 60%,transparent 70%)",
                  animation: "glow 2.2s ease-in-out infinite",
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

