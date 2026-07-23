import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, X, Download } from "lucide-react";
import { LayoutGroup, motion } from "framer-motion";
import type { MindNode, Project } from "@/lib/types";
import { resolveImage } from "@/lib/imageStorage";
import { useStore } from "@/lib/store";
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
import { AvatarLayer } from "@/components/shared/AvatarLayer";
import { DropIndicator, visualInsertIndex } from "@/components/shared/DropIndicator";

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

function TierItem({
  node,
  size = 92,
  highlighted = false,
  draggable = false,
  onDragStart,
  onDragEnd,
}: {
  node: MindNode;
  size?: number;
  highlighted?: boolean;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const url = useResolvedImage(node);
  const ring = highlighted
    ? { boxShadow: `0 0 28px ${node.color ?? "rgba(255,255,255,0.55)"}` }
    : undefined;
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`relative rounded-md overflow-hidden border ${
        highlighted
          ? "ring-2 ring-white border-white"
          : "border-white/20"
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{ width: size, height: size, background: node.color ?? "#111", ...ring }}
    >
      {url ? (
        <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-[11px] text-center px-1.5 leading-tight text-white/95 break-words whitespace-normal overflow-hidden">
          {node.text || "Item"}
        </div>
      )}
      {url && node.text && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-1 py-0.5 leading-tight break-words whitespace-normal max-h-[55%] overflow-hidden">
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
  const setParent = useStore((s) => s.setParent);
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
  const tierIds = useMemo(() => new Set(tiers.map((t) => t.id)), [tiers]);

  const allItems = useMemo(
    () => project.nodes
      .filter((n) => n.role === "item")
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [project.nodes],
  );

  /**
   * Snapshot the initial placement state. The mode is decided ONCE at mount
   * and locked for the session — otherwise placing an item live in manual
   * mode would flip to the animated queue and end the presentation.
   */
  const initialPreplacedIds = useState<string[]>(() =>
    project.nodes
      .filter((n) => n.role === "item" && n.parentId && n.parentId !== board?.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((n) => n.id),
  )[0];
  const initialHadItems = useState<boolean>(() =>
    project.nodes.some((n) => n.role === "item"),
  )[0];

  /** Items pre-placed in a tier at mount time, resolved to current nodes. */
  const preplacedQueue = useMemo(() => {
    const byId = new Map(allItems.map((n) => [n.id, n]));
    return initialPreplacedIds.map((id) => byId.get(id)).filter(Boolean) as MindNode[];
  }, [allItems, initialPreplacedIds]);

  /** MANUAL mode: no items were pre-placed at mount → user drags live. Locked for the session. */
  const manualMode = initialPreplacedIds.length === 0 && initialHadItems;

  /* ============ ANIMATED MODE (pre-placed) ============ */

  /** idx = number of items already placed (0..queue.length). */
  const [idx, setIdx] = useState(0);
  const currentItemId = idx > 0 ? preplacedQueue[idx - 1].id : null;
  const currentTierId = idx > 0 ? preplacedQueue[idx - 1].parentId : (preplacedQueue[0]?.parentId ?? null);

  const placedByTier = useMemo(() => {
    const m = new Map<string, MindNode[]>();
    for (const t of tiers) m.set(t.id, []);
    if (manualMode) {
      // In manual mode, always show live state from allItems
      for (const n of allItems) {
        if (n.parentId && m.has(n.parentId)) m.get(n.parentId)!.push(n);
      }
    } else {
      for (let i = 0; i < idx; i++) {
        const q = preplacedQueue[i];
        if (q.parentId && m.has(q.parentId)) m.get(q.parentId)!.push(q);
      }
    }
    // Preserve the creator's manual position within each tier.
    const byPlacement = (a: MindNode, b: MindNode) =>
      (a.placementOrder ?? a.order ?? 0) - (b.placementOrder ?? b.order ?? 0);
    for (const arr of m.values()) arr.sort(byPlacement);
    return m;
  }, [tiers, manualMode, allItems, idx, preplacedQueue]);


  const remaining = manualMode
    ? allItems.filter((n) => !n.parentId || !tierIds.has(n.parentId))
    : preplacedQueue.slice(idx);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (manualMode || !scrollRef.current || !currentTierId) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-tier-id="${currentTierId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [idx, currentTierId, manualMode]);

  const next = () => { if (!manualMode && countdown === null) setIdx((i) => Math.min(preplacedQueue.length, i + 1)); };
  const prev = () => { if (!manualMode && countdown === null) setIdx((i) => Math.max(0, i - 1)); };

  /* ============ DRAG (manual mode) ============ */
  const [dragId, setDragId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ key: string; idx: number } | null>(null);
  const updateNode = useStore((s) => s.updateNode);

  /** Where the user drops is where the item stays: compute insertion index
   * from pointer position and rewrite placementOrder for the destination. */
  function commitDrop(
    container: HTMLElement,
    clientX: number,
    clientY: number,
    targetTierId: string | null,
  ) {
    if (!dragId) return;
    const item = allItems.find((n) => n.id === dragId);
    if (!item) return;
    const cards = Array.from(container.querySelectorAll<HTMLElement>("[data-item-id]"));
    let insertIdx = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const el = cards[i];
      if (el.dataset.itemId === dragId) continue;
      const r = el.getBoundingClientRect();
      if (clientY < r.top || clientY > r.bottom) continue;
      if (clientX < r.left + r.width / 2) { insertIdx = i; break; }
    }
    const nextParent = targetTierId ?? (board ? board.id : null);
    if (nextParent && item.parentId !== nextParent) {
      setParent(project.id, dragId, nextParent);
    }
    // Collect destination bucket (excluding dragged), insert, rewrite placementOrder.
    const dest = targetTierId
      ? allItems.filter((n) => n.parentId === targetTierId && n.id !== dragId)
      : allItems.filter((n) => (!n.parentId || !tierIds.has(n.parentId)) && n.id !== dragId);
    dest.sort((a, b) => (a.placementOrder ?? a.order ?? 0) - (b.placementOrder ?? b.order ?? 0));
    // Adjust for dragged card previously appearing before insertIdx in the visible list.
    const draggedVisibleIdx = cards.findIndex((el) => el.dataset.itemId === dragId);
    if (draggedVisibleIdx !== -1 && draggedVisibleIdx < insertIdx) insertIdx -= 1;
    insertIdx = Math.max(0, Math.min(insertIdx, dest.length));
    const arr = [...dest.slice(0, insertIdx), item, ...dest.slice(insertIdx)];
    arr.forEach((n, i) => {
      if ((n.placementOrder ?? -1) !== i) {
        updateNode(project.id, n.id, { placementOrder: i });
      }
    });
    setDragId(null);
  }

  const onTierDrop = (tierId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    commitDrop(e.currentTarget as HTMLElement, e.clientX, e.clientY, tierId);
    setHover(null);
  };
  const onPoolDrop = (e: React.DragEvent) => {
    e.preventDefault();
    commitDrop(e.currentTarget as HTMLElement, e.clientX, e.clientY, null);
    setHover(null);
  };
  const allowDrop = (e: React.DragEvent) => { if (dragId) e.preventDefault(); };
  const onHoverOver = (key: string) => (e: React.DragEvent) => {
    if (!dragId) return;
    e.preventDefault();
    const idx = visualInsertIndex(e.currentTarget as HTMLElement, e.clientX, e.clientY);
    if (hover?.key !== key || hover.idx !== idx) setHover({ key, idx });
  };
  const onHoverLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setHover(null);
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
  }, [preplacedQueue.length, recording, manualMode]);

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
    <div className="fixed inset-0 bg-background text-foreground overflow-hidden">
      {recording && recState?.state === "recording" && recState.startedAt != null && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
          <RecorderHUD startedAt={recState.startedAt} onStop={stopAndDownload} cropped={cropOk} />
        </div>
      )}

      <div className={recording ? "absolute inset-0 grid place-items-center" : "absolute inset-0"}>
        <div ref={frameRef} style={frameStyle} className="bg-background">
          <AvatarLayer project={project} frameSize={size} />
          <LayoutGroup>
            <div className="absolute inset-0 flex flex-col p-6">
              <div className="text-2xl font-bold text-center mb-2 opacity-90">{project.title}</div>
              {manualMode && (
                <div className="text-center text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
                  Modo manual — arraste os itens para os tiers
                </div>
              )}

              {/* Tiers */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-smooth space-y-2 pr-1">
                {tiers.map((tier) => {
                  const items = placedByTier.get(tier.id) ?? [];
                  const isActive = !manualMode && currentTierId === tier.id;
                  return (
                    <div
                      key={tier.id}
                      data-tier-id={tier.id}
                      onDragOver={allowDrop}
                      onDrop={onTierDrop(tier.id)}
                      className={`flex items-stretch rounded-lg overflow-hidden border border-border transition-all duration-300 ${
                        manualMode
                          ? (dragId ? "ring-2 ring-primary/40" : "")
                          : (isActive ? "opacity-100 scale-100" : "opacity-45 scale-[0.98]")
                      }`}
                    >
                      <div
                        className="min-w-[8rem] max-w-[14rem] shrink-0 grid place-items-center px-3 py-3 font-black text-lg text-white text-center uppercase tracking-wider break-words whitespace-normal leading-tight"
                        style={{ background: tier.color || "#334155" }}
                      >
                        {tier.text}
                      </div>
                      <div className="flex-1 min-h-[112px] bg-muted/30 p-3 flex flex-wrap gap-2 items-start">
                        {items.map((it) => (
                          <motion.div
                            key={it.id}
                            data-item-id={it.id}
                            layoutId={`item-${it.id}`}
                            transition={{ type: "spring", stiffness: 260, damping: 28 }}
                          >

                            <TierItem
                              node={it}
                              highlighted={!manualMode && currentItemId === it.id}
                              draggable={manualMode}
                              onDragStart={() => setDragId(it.id)}
                              onDragEnd={() => setDragId(null)}
                            />
                          </motion.div>
                        ))}
                        {items.length === 0 && !isActive && (
                          <div className="text-xs opacity-40 italic self-center px-2">
                            {manualMode ? "solte aqui" : "— vazio —"}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pool of remaining items */}
              <div
                onDragOver={allowDrop}
                onDrop={onPoolDrop}
                className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[11px] uppercase tracking-widest opacity-60">
                    {manualMode ? "Arraste para classificar" : "A classificar"}
                  </div>
                  <div className="text-[11px] opacity-60 font-mono tabular-nums">
                    {remaining.length} restante{remaining.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex gap-2 items-center overflow-x-auto min-h-[80px]">
                  {remaining.length === 0 && (
                    <div className="text-xs opacity-50 italic self-center px-2">
                      Todos os itens foram classificados.
                    </div>
                  )}
                  {remaining.map((it, i) => (
                    <motion.div
                      key={it.id}
                      data-item-id={it.id}
                      layoutId={`item-${it.id}`}
                      transition={{ type: "spring", stiffness: 260, damping: 28 }}
                    >

                      <TierItem
                        node={it}
                        size={72}
                        highlighted={!manualMode && i === 0}
                        draggable={manualMode}
                        onDragStart={() => setDragId(it.id)}
                        onDragEnd={() => setDragId(null)}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </LayoutGroup>

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

      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        {!recording && <ThemeToggle />}
        <button onClick={stopAndDownload} className="size-10 grid place-items-center rounded-full bg-foreground/10 backdrop-blur border border-border hover:bg-foreground/20 text-foreground">
          <X className="size-4" />
        </button>
      </div>

      {!manualMode && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-foreground/10 backdrop-blur border border-border text-foreground px-2 py-2">
          <button onClick={prev} disabled={idx === 0} className="size-9 grid place-items-center rounded-full hover:bg-foreground/10 disabled:opacity-40">
            <ChevronLeft className="size-5" />
          </button>
          <span className="px-3 text-sm font-mono tabular-nums min-w-[70px] text-center">
            {`${idx} / ${preplacedQueue.length}`}
          </span>
          <button onClick={next} disabled={idx >= preplacedQueue.length} className="size-9 grid place-items-center rounded-full hover:bg-foreground/10 disabled:opacity-40">
            <ChevronRight className="size-5" />
          </button>
        </div>
      )}

      {allItems.length === 0 && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <p className="text-muted-foreground">Adicione tiers e itens antes de apresentar.</p>
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
