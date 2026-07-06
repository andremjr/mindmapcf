import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { Project, TextNode, Chapter } from "@/lib/types";
import { useStore } from "@/lib/store";
import { cameraAt, activeBlockAt } from "@/lib/cameraEngine";
import { CANVAS, validateCanvasLayout } from "@/lib/layoutEngine";

interface Props {
  project: Project;
  debug?: boolean;
}

/**
 * Canvas Narrativo v2 — plano vertical infinito com linha guia colorida,
 * capítulos, cards por tipo e câmera cinematográfica.
 */
export function CanvasStage({ project, debug = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 700 });
  const playback = useStore((s) => s.playback);
  const setViewport = useStore((s) => s.setViewport);
  const setSelected = useStore((s) => s.setSelectedNode);
  const moveNode = useStore((s) => s.moveNode);

  const preset = project.visualPreset;
  const safeArea = project.safeArea ?? "16:9";
  const chapters = project.chapters ?? [];

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const activeBlockIdx = useMemo(
    () => activeBlockAt(project.blocks, playback.time),
    [project.blocks, playback.time],
  );
  const activeNodeId =
    playback.selectedNodeId ??
    (project.blocks[activeBlockIdx] && `n_${project.blocks[activeBlockIdx].id}`);

  // Câmera automática.
  useEffect(() => {
    if (!playback.autoCamera || !playback.playing) return;
    const cam = cameraAt(project.camera, playback.time);
    setViewport({ x: cam.x, y: cam.y, zoom: cam.zoom, rotation: cam.rotation });
  }, [playback.time, playback.autoCamera, playback.playing, project.camera, setViewport]);

  // Validação (debug)
  const validation = useMemo(
    () => (debug ? validateCanvasLayout(project.nodes, chapters) : null),
    [debug, project.nodes, chapters],
  );

  // Pan / wheel zoom.
  const panStartRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-node]")) return;
    setSelected(undefined);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      vx: playback.viewport.x,
      vy: playback.viewport.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const start = panStartRef.current;
    if (!start) return;
    const dx = (e.clientX - start.x) / playback.viewport.zoom;
    const dy = (e.clientY - start.y) / playback.viewport.zoom;
    setViewport({ x: start.vx - dx, y: start.vy - dy });
  };
  const onPointerUp = () => {
    panStartRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const next = Math.max(0.15, Math.min(3, playback.viewport.zoom * factor));
    setViewport({ zoom: next });
  };

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      return {
        x: playback.viewport.x + (sx - rect.left - cx) / playback.viewport.zoom,
        y: playback.viewport.y + (sy - rect.top - cy) / playback.viewport.zoom,
      };
    },
    [playback.viewport],
  );

  void size;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden select-none cursor-grab active:cursor-grabbing"
      style={{
        background: preset.backgroundGradient ?? preset.backgroundColor ?? "#08090c",
        color: preset.textColor,
        fontFamily: preset.fontFamily,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      {/* Fundo com leve ruído/grid */}
      <BackgroundLayer preset={preset} viewport={playback.viewport} />

      <div className="absolute inset-0">
        <div
          className="absolute left-1/2 top-1/2 will-change-transform"
          style={{
            transform: `translate3d(${-playback.viewport.x * playback.viewport.zoom}px, ${
              -playback.viewport.y * playback.viewport.zoom
            }px, 0) scale(${playback.viewport.zoom})`,
            transformOrigin: "0 0",
            transition: playback.playing
              ? `transform ${1.6 / Math.max(playback.speed, 0.25)}s cubic-bezier(0.16,0.84,0.24,1)`
              : "transform 0.32s cubic-bezier(0.22,0.61,0.36,1)",
          }}
        >
          {/* Curved connectors between parent and children */}
          <Connectors nodes={project.nodes} />

          {project.nodes.map((n) => (
            <NodeCard
              key={n.id}
              node={n}
              isActive={n.id === activeNodeId}
              isSelected={n.id === playback.selectedNodeId}
              debug={debug}
              onSelect={() => setSelected(n.id)}
              onDrag={(dx, dy) => moveNode(project.id, n.id, n.x + dx, n.y + dy)}
              zoom={playback.viewport.zoom}
            />
          ))}
        </div>
      </div>

      {/* Safe area overlay. */}
      <SafeAreaOverlay area={safeArea} />

      {/* Vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, transparent ${
            70 - (preset.vignette ?? 0.6) * 30
          }%, rgba(0,0,0,${0.45 + (preset.vignette ?? 0.6) * 0.4}) 100%)`,
        }}
      />

      {project.nodes.length === 0 && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="surface-card px-6 py-4 text-center max-w-sm">
            <p className="text-sm text-muted-foreground">
              Gere os blocos e clique em <strong>Gerar layout</strong> para criar o canvas.
            </p>
          </div>
        </div>
      )}

      {debug && validation && <DebugPanel validation={validation} chapters={chapters.length} nodes={project.nodes.length} duration={project.durationSec} />}
      {debug && <span className="pointer-events-none absolute top-2 left-2 text-[10px] tracking-widest text-amber-400/80 z-20">DEBUG</span>}

      {/* Ajuda de gestos */}
      <div className="pointer-events-none absolute right-2 bottom-2 text-[10px] text-muted-foreground/60 text-mono z-10">
        arraste / scroll = pan/zoom
      </div>
      </div>

  );
}

// ---------------- Background ----------------

function BackgroundLayer({
  preset,
  viewport,
}: {
  preset: Project["visualPreset"];
  viewport: { x: number; y: number; zoom: number };
}) {
  const cell = 80 * viewport.zoom;
  const ox = -viewport.x * viewport.zoom;
  const oy = -viewport.y * viewport.zoom;
  return (
    <>
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.05]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.7) 1px, transparent 1px)",
          backgroundSize: `${cell}px ${cell}px`,
          backgroundPosition: `${ox}px ${oy}px`,
        }}
      />
      {(preset.grain ?? 0.1) > 0.02 && (
        <div
          className="pointer-events-none absolute inset-0 mix-blend-overlay"
          style={{
            opacity: (preset.grain ?? 0.1) * 0.4,
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>\")",
          }}
        />
      )}
    </>
  );
}

// ---------------- Guide line + chapters ----------------

function GuideLine({
  chapters,
  nodes,
}: {
  chapters: Chapter[];
  nodes: TextNode[];
}) {
  if (nodes.length === 0) return null;
  const x = CANVAS.guideX;
  const startY = Math.min(...nodes.map((n) => (n.y ?? 0) - (n.height ?? 200) / 2)) - 120;
  const endY = Math.max(...nodes.map((n) => (n.y ?? 0) + (n.height ?? 200) / 2)) + 120;

  return (
    <div className="absolute" style={{ left: 0, top: 0, pointerEvents: "none" }}>
      {/* Segmentos coloridos por capítulo (fallback: cinza se sem capítulos) */}
      {chapters.length > 0 ? (
        chapters.map((c) => (
          <div key={c.index}>
            <div
              style={{
                position: "absolute",
                left: x - 1,
                top: c.startY - 40,
                width: 2,
                height: Math.max(30, c.endY - c.startY + 80),
                background: `linear-gradient(180deg, ${c.color}00, ${c.color}, ${c.color}00)`,
                boxShadow: `0 0 24px ${c.color}55`,
                borderRadius: 2,
              }}
            />
            {/* Marker + label */}
            <div
              style={{
                position: "absolute",
                left: x - 7,
                top: c.startY - 10,
                width: 14,
                height: 14,
                borderRadius: 999,
                background: c.color,
                boxShadow: `0 0 20px ${c.color}, 0 0 0 4px rgba(0,0,0,0.6)`,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: x + 22,
                top: c.startY - 18,
                fontSize: 13,
                letterSpacing: "0.3em",
                fontWeight: 600,
                color: c.color,
                textShadow: `0 0 12px ${c.color}66`,
              }}
            >
              {`CAP. ${String(c.index + 1).padStart(2, "0")} · ${c.title}`}
            </div>
          </div>
        ))
      ) : (
        <div
          style={{
            position: "absolute",
            left: x - 1,
            top: startY,
            width: 2,
            height: endY - startY,
            background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.25), transparent)",
          }}
        />
      )}

      {/* Bolinhas conectando os nós */}
      {nodes.map((n) => (
        <div
          key={`dot_${n.id}`}
          style={{
            position: "absolute",
            left: x - 4,
            top: n.y - 4,
            width: 8,
            height: 8,
            borderRadius: 999,
            background: n.chapterColor ?? "#888",
            opacity: 0.9,
            boxShadow: `0 0 12px ${n.chapterColor ?? "#888"}aa`,
          }}
        />
      ))}
    </div>
  );
}

// ---------------- Node card ----------------

function highlightText(text: string, words: string[] = [], color: string) {
  if (!words.length) return text;
  const pattern = new RegExp(
    `\\b(${words.map((w) => w.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")).join("|")})\\b`,
    "gi",
  );
  const parts = text.split(pattern);
  return parts.map((p, i) =>
    words.some((w) => w.toLowerCase() === p.toLowerCase()) ? (
      <span
        key={i}
        style={{
          color,
          fontWeight: 700,
          background: `linear-gradient(180deg, transparent 62%, ${color}30 62%, ${color}30 92%, transparent 92%)`,
          padding: "0 4px",
        }}
      >
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function NodeCard({
  node,
  isActive,
  isSelected,
  debug,
  onSelect,
  onDrag,
  zoom,
}: {
  node: TextNode;
  isActive: boolean;
  isSelected: boolean;
  debug: boolean;
  onSelect: () => void;
  onDrag: (dx: number, dy: number) => void;
  zoom: number;
}) {
  const draggingRef = useRef<{ sx: number; sy: number } | null>(null);
  const kind = node.nodeKind ?? "statement";
  const color = node.chapterColor ?? node.accentColor ?? "#ff9f43";
  const width = node.width ?? 900;
  const height = node.height ?? 200;
  const text = node.shortText || node.text;

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect();
    draggingRef.current = { sx: e.clientX, sy: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = draggingRef.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / zoom;
    const dy = (e.clientY - d.sy) / zoom;
    if (Math.abs(dx) + Math.abs(dy) > 2) {
      draggingRef.current = { sx: e.clientX, sy: e.clientY };
      onDrag(dx, dy);
    }
  };
  const onPointerUp = () => {
    draggingRef.current = null;
  };

  const fontSize =
    kind === "hook" ? 76
    : kind === "conclusion" ? 60
    : kind === "quote" ? 52
    : kind === "transition" ? 44
    : kind === "evidence" ? 40
    : 48;

  const baseBg = "#111114";
  const borderColor = isActive ? color : "rgba(255,255,255,0.08)";
  const glow = isActive ? `0 20px 60px ${color}30, 0 0 0 1px ${color}66` : "0 8px 24px rgba(0,0,0,0.5)";

  return (
    <div
      data-node={node.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="absolute cursor-pointer"
      style={{
        left: node.x - width / 2,
        top: node.y - height / 2,
        width,
        minHeight: height,
        opacity: isActive ? 1 : 0.55,
        filter: isActive ? "none" : "blur(0.3px)",
        transition: "opacity 0.9s cubic-bezier(0.22,0.61,0.36,1), filter 0.9s",
        zIndex: isActive ? 10 : 1,
      }}
    >
      {/* Card específico por tipo */}
      {kind === "evidence" ? (
        <EvidenceCard node={node} color={color} isActive={isActive} />
      ) : kind === "quote" ? (
        <QuoteCard text={text} color={color} isActive={isActive} width={width} />
      ) : kind === "transition" ? (
        <TransitionCard text={text} color={color} isActive={isActive} />
      ) : (
        <div
          style={{
            background: kind === "hook" || kind === "conclusion"
              ? `linear-gradient(135deg, ${baseBg}, #16161a)`
              : baseBg,
            borderRadius: 24,
            border: `1px solid ${borderColor}`,
            boxShadow: glow,
            padding: "36px 44px",
            minHeight: height,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            outline: isSelected ? `2px solid ${color}` : "none",
            outlineOffset: 8,
          }}
        >
          {kind === "hook" && (
            <div
              style={{
                fontSize: 13,
                letterSpacing: "0.35em",
                color,
                marginBottom: 20,
                fontWeight: 600,
              }}
            >
              ▍ GANCHO
            </div>
          )}
          {kind === "conclusion" && (
            <div
              style={{
                fontSize: 13,
                letterSpacing: "0.35em",
                color,
                marginBottom: 20,
                fontWeight: 600,
              }}
            >
              ▍ CONCLUSÃO
            </div>
          )}
          <div
            style={{
              fontSize,
              fontWeight: kind === "hook" || kind === "conclusion" ? 700 : 500,
              lineHeight: 1.12,
              letterSpacing: "-0.025em",
              color: "#f5f5f5",
            }}
          >
            {highlightText(text, node.emphasisWords, color)}
          </div>
        </div>
      )}

      {debug && (
        <div
          className="pointer-events-none absolute"
          style={{
            inset: 0,
            border: `1px dashed ${color}`,
            borderRadius: 24,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -18,
              left: 0,
              fontSize: 10,
              color,
              fontFamily: "ui-monospace, monospace",
            }}
          >
            #{node.id} · {kind} · t={node.startTime?.toFixed(1)}–{node.endTime?.toFixed(1)} · cap={node.chapterIndex}
          </div>
        </div>
      )}
    </div>
  );
}

function EvidenceCard({ node, color, isActive }: { node: TextNode; color: string; isActive: boolean }) {
  const text = node.shortText || node.text;
  return (
    <div
      style={{
        background: "#141418",
        borderRadius: 20,
        border: `1px solid ${isActive ? color : "rgba(255,255,255,0.1)"}`,
        boxShadow: isActive ? `0 20px 60px ${color}30` : "0 8px 24px rgba(0,0,0,0.5)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: "#1c1c22",
          borderBottom: `1px solid ${color}55`,
          padding: "16px 28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 12, letterSpacing: "0.3em", color, fontWeight: 600 }}>
          ▍ FONTE / DOCUMENTO
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "ui-monospace, monospace" }}>
          REF · {node.blockId.slice(0, 6).toUpperCase()}
        </div>
      </div>
      <div style={{ padding: "32px 36px" }}>
        <div
          style={{
            fontSize: 20,
            color: "rgba(255,255,255,0.5)",
            marginBottom: 14,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          Trecho documental
        </div>
        <div
          style={{
            fontSize: 40,
            fontWeight: 500,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            color: "#f5f5f5",
          }}
        >
          {highlightText(text, node.emphasisWords, color)}
        </div>
      </div>
    </div>
  );
}

function QuoteCard({ text, color, isActive, width }: { text: string; color: string; isActive: boolean; width: number }) {
  return (
    <div
      style={{
        background: "#0f0f13",
        borderRadius: 24,
        border: `1px solid ${isActive ? color + "aa" : "rgba(255,255,255,0.08)"}`,
        padding: "44px 56px",
        boxShadow: isActive ? `0 20px 60px ${color}25` : "0 8px 24px rgba(0,0,0,0.5)",
        position: "relative",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 6,
          left: 22,
          fontSize: 130,
          color: color + "44",
          fontFamily: "serif",
          lineHeight: 1,
        }}
      >
        “
      </div>
      <div
        style={{
          fontSize: width > 900 ? 56 : 48,
          fontWeight: 500,
          lineHeight: 1.18,
          letterSpacing: "-0.02em",
          fontStyle: "italic",
          color: "#f5f5f5",
          paddingLeft: 30,
        }}
      >
        {text}
      </div>
    </div>
  );
}

function TransitionCard({ text, color, isActive }: { text: string; color: string; isActive: boolean }) {
  return (
    <div
      style={{
        padding: "24px 40px",
        borderLeft: `3px solid ${color}`,
        color: isActive ? "#f5f5f5" : "rgba(245,245,245,0.7)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          letterSpacing: "0.4em",
          color,
          marginBottom: 12,
          fontWeight: 600,
        }}
      >
        ⏵ TRANSIÇÃO
      </div>
      <div
        style={{
          fontSize: 44,
          fontWeight: 500,
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          textShadow: isActive ? `0 0 30px ${color}44` : "none",
        }}
      >
        {text}
      </div>
    </div>
  );
}

// ---------------- Safe area ----------------

function SafeAreaOverlay({ area }: { area: string }) {
  const [w, h] = area === "9:16" ? [9, 16] : area === "1:1" ? [1, 1] : [16, 9];
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div
        style={{
          aspectRatio: `${w} / ${h}`,
          height: "78%",
          border: "1px dashed rgba(255,255,255,0.08)",
          borderRadius: 4,
        }}
      />
    </div>
  );
}

// ---------------- Debug panel ----------------

function DebugPanel({
  validation,
  chapters,
  nodes,
  duration,
}: {
  validation: ReturnType<typeof validateCanvasLayout>;
  chapters: number;
  nodes: number;
  duration: number;
}) {
  return (
    <div className="absolute top-2 right-2 z-20 surface-card px-3 py-2 text-[10px] text-mono space-y-0.5">
      <div className="text-muted-foreground">DEBUG · CANVAS</div>
      <div>nós: <strong>{nodes}</strong></div>
      <div>capítulos: <strong>{chapters}</strong></div>
      <div>duração: <strong>{duration.toFixed(1)}s</strong></div>
      <div>altura: <strong>{validation.totalHeight.toFixed(0)}px</strong></div>
      <div
        style={{
          color: validation.ok ? "#34d399" : "#ff4d6d",
          fontWeight: 700,
          marginTop: 4,
        }}
      >
        {validation.ok
          ? "✓ sem sobreposições"
          : `⚠ ${validation.overlaps.length} colisões`}
      </div>
      {validation.outOfCanvas.length > 0 && (
        <div style={{ color: "#ff9f43" }}>fora do canvas: {validation.outOfCanvas.length}</div>
      )}
    </div>
  );
}
