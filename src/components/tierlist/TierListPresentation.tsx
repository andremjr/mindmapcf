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

function TierItem({ node, highlighted }: { node: MindNode; highlighted: boolean }) {
  const url = useResolvedImage(node);
  return (
    <div
      className={`relative rounded-md overflow-hidden shrink-0 border transition-all ${
        highlighted ? "ring-2 ring-white scale-105 shadow-[0_0_24px_rgba(255,255,255,0.5)] border-white" : "border-white/20"
      }`}
      style={{ width: 88, height: 88, background: "#111" }}
    >
      {url ? (
        <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-[11px] text-center px-1 leading-tight text-white/95">
          {node.text || "Item"}
        </div>
      )}
      {url && node.text && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-1 py-0.5 truncate">
          {node.text}
        </div>
      )}
    </div>
  );
}

export function TierListPresentation({
  project,
  recording = false,
}: {
  project: Project;
  recording?: boolean;
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

  const board = project.nodes.find((n) => n.role === "board" || !n.parentId);
  const tiers = useMemo(
    () => project.nodes
      .filter((n) => n.role === "tier" && n.parentId === board?.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [project.nodes, board?.id],
  );
  const itemsByTier = useMemo(() => {
    const m = new Map<string, MindNode[]>();
    for (const t of tiers) m.set(t.id, []);
    for (const n of project.nodes) {
      if (n.role !== "item") continue;
      if (n.parentId && m.has(n.parentId)) m.get(n.parentId)!.push(n);
    }
    return m;
  }, [project.nodes, tiers]);

  /** Nav order: [tier1, item1a, item1b, tier2, ...] */
  const nav = useMemo(() => {
    const arr: Array<{ tierId: string; itemId?: string }> = [];
    for (const t of tiers) {
      arr.push({ tierId: t.id });
      for (const it of itemsByTier.get(t.id) ?? []) arr.push({ tierId: t.id, itemId: it.id });
    }
    return arr;
  }, [tiers, itemsByTier]);

  const [idx, setIdx] = useState(0);
  const current = nav[idx];

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollRef.current || !current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-tier-id="${current.tierId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [idx, current?.tierId]);

  const next = () => { if (countdown === null) setIdx((i) => Math.min(nav.length - 1, i + 1)); };
  const prev = () => { if (countdown === null) setIdx((i) => Math.max(0, i - 1)); };

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

  return (
    <div className="fixed inset-0 bg-neutral-950 text-white overflow-hidden">
      {recording && recState?.state === "recording" && recState.startedAt != null && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
          <RecorderHUD startedAt={recState.startedAt} onStop={stopAndDownload} cropped={cropOk} />
        </div>
      )}

      <div className={recording ? "absolute inset-0 grid place-items-center" : "absolute inset-0"}>
        <div ref={frameRef} style={frameStyle} className="bg-neutral-950">
          <div className="absolute inset-0 flex flex-col p-6">
            <div className="text-2xl font-bold text-center mb-4 opacity-90">{project.title}</div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-smooth space-y-2">
              {tiers.map((tier) => {
                const items = itemsByTier.get(tier.id) ?? [];
                const isActive = current?.tierId === tier.id;
                return (
                  <div
                    key={tier.id}
                    data-tier-id={tier.id}
                    className={`flex items-stretch rounded-lg overflow-hidden border border-white/10 transition-all duration-300 ${
                      isActive ? "opacity-100 scale-100" : "opacity-45 scale-[0.98]"
                    }`}
                  >
                    <div
                      className="w-28 shrink-0 grid place-items-center px-2 py-3 font-black text-2xl text-white text-center uppercase tracking-wider"
                      style={{ background: tier.color || "#334155" }}
                    >
                      {tier.text}
                    </div>
                    <div className="flex-1 min-h-[112px] bg-black/30 p-3 flex flex-wrap gap-2 items-start">
                      {items.map((it) => (
                        <TierItem
                          key={it.id}
                          node={it}
                          highlighted={isActive && current?.itemId === it.id}
                        />
                      ))}
                      {items.length === 0 && (
                        <div className="text-xs opacity-50 italic self-center px-2">— vazio —</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

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

      <div className="absolute top-4 right-4 z-10">
        <button onClick={stopAndDownload} className="size-10 grid place-items-center rounded-full bg-black/70 backdrop-blur border border-white/20 hover:bg-black/90">
          <X className="size-4" />
        </button>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-black/70 backdrop-blur border border-white/20 px-2 py-2">
        <button onClick={prev} disabled={idx === 0} className="size-9 grid place-items-center rounded-full hover:bg-white/10 disabled:opacity-40">
          <ChevronLeft className="size-5" />
        </button>
        <span className="px-3 text-sm font-mono tabular-nums min-w-[70px] text-center">
          {nav.length > 0 ? `${idx + 1} / ${nav.length}` : "0 / 0"}
        </span>
        <button onClick={next} disabled={idx >= nav.length - 1} className="size-9 grid place-items-center rounded-full hover:bg-white/10 disabled:opacity-40">
          <ChevronRight className="size-5" />
        </button>
      </div>

      {nav.length === 0 && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="text-white/60">Adicione tiers e itens antes de apresentar.</p>
        </div>
      )}

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
