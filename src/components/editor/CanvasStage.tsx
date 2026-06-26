import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { Project, TextNode, CameraKeyframe } from "@/lib/types";
import { useStore } from "@/lib/store";
import { cameraAt, activeBlockAt } from "@/lib/cameraEngine";

interface Props {
  project: Project;
}

/**
 * Canvas infinito textual.
 * - pan: arrastar área vazia
 * - zoom: wheel (com Ctrl/⌘ acelera)
 * - drag node: arrastar texto
 * - clique nó: seleciona
 * - auto-camera: enquanto playing && autoCamera, viewport segue keyframes
 */
export function CanvasStage({ project }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 700 });
  const playback = useStore((s) => s.playback);
  const setViewport = useStore((s) => s.setViewport);
  const setSelected = useStore((s) => s.setSelectedNode);
  const moveNode = useStore((s) => s.moveNode);

  const preset = project.visualPreset;
  const safeArea = project.safeArea ?? "16:9";

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bloco/keyframe ativo no tempo atual.
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

  // Pan / wheel zoom.
  const panStartRef = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
  } | null>(null);

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

  // Conversão "screen -> world" e drag de nós.
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

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden select-none cursor-grab active:cursor-grabbing"
      style={{
        background: preset.backgroundGradient ?? preset.backgroundColor,
        color: preset.textColor,
        fontFamily: preset.fontFamily,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <GridLayer style={preset.gridStyle} viewport={playback.viewport} />

      <div
        className="absolute inset-0"
        style={{
          perspective: `${1400 - preset.depthIntensity * 400}px`,
          perspectiveOrigin: "50% 45%",
        }}
      >
        <div
          className="absolute left-1/2 top-1/2 will-change-transform"
          style={{
            transform: `translate3d(${-playback.viewport.x * playback.viewport.zoom}px, ${
              -playback.viewport.y * playback.viewport.zoom
            }px, 0) scale(${playback.viewport.zoom}) rotate(${playback.viewport.rotation}deg)`,
            transformOrigin: "0 0",
            transition: playback.playing
              ? `transform ${1.6 / Math.max(playback.speed, 0.25)}s cubic-bezier(0.16,0.84,0.24,1)`
              : "transform 0.32s cubic-bezier(0.22,0.61,0.36,1)",
          }}
        >
          {/* Conectores entre vizinhos. */}
          <ConnectorLayer nodes={project.nodes} preset={preset} activeNodeId={activeNodeId} />

          {project.nodes.map((n, i) => {
            const activeIdx = project.nodes.findIndex((x) => x.id === activeNodeId);
            const relation: "active" | "past" | "future" =
              i === activeIdx ? "active" : i < activeIdx ? "past" : "future";
            return (
              <NodeView
                key={n.id}
                node={n}
                isActive={n.id === activeNodeId}
                isSelected={n.id === playback.selectedNodeId}
                relation={relation}
                preset={preset}
                onSelect={() => setSelected(n.id)}
                onDrag={(dx, dy) => moveNode(project.id, n.id, n.x + dx, n.y + dy)}
                screenToWorld={screenToWorld}
                zoom={playback.viewport.zoom}
              />
            );
          })}
        </div>
      </div>

      {/* Safe area overlay. */}
      <SafeAreaOverlay area={safeArea} />

      {/* Vignette + grain. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, transparent ${
            70 - preset.vignette * 30
          }%, oklch(0 0 0 / ${0.4 + preset.vignette * 0.45}) 100%)`,
        }}
      />
      {preset.grain > 0.02 && (
        <div
          className="pointer-events-none absolute inset-0 mix-blend-overlay"
          style={{
            opacity: preset.grain * 0.5,
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>\")",
          }}
        />
      )}

      {project.nodes.length === 0 && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="surface-card px-6 py-4 text-center max-w-sm">
            <p className="text-sm text-muted-foreground">
              Gere os blocos e clique em <strong>Gerar layout</strong> para criar o canvas.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function GridLayer({
  style,
  viewport,
}: {
  style: Project["visualPreset"]["gridStyle"];
  viewport: { x: number; y: number; zoom: number };
}) {
  if (style === "none") return null;
  const cell = 60 * viewport.zoom;
  const ox = -viewport.x * viewport.zoom;
  const oy = -viewport.y * viewport.zoom;

  if (style === "dots") {
    return (
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle, oklch(1 0 0 / 0.08) 1px, transparent 1px)",
          backgroundSize: `${cell}px ${cell}px`,
          backgroundPosition: `${ox}px ${oy}px`,
        }}
      />
    );
  }
  if (style === "lines3d") {
    return (
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(oklch(0.78 0.16 220 / 0.08) 1px, transparent 1px), linear-gradient(90deg, oklch(0.78 0.16 220 / 0.08) 1px, transparent 1px)",
          backgroundSize: `${cell}px ${cell}px`,
          backgroundPosition: `${ox}px ${oy}px`,
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
    );
  }
  return (
    <div
      className="absolute inset-0 pointer-events-none opacity-25"
      style={{
        backgroundImage:
          "linear-gradient(oklch(1 0 0 / 0.05) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.05) 1px, transparent 1px)",
        backgroundSize: `${cell}px ${cell}px`,
        backgroundPosition: `${ox}px ${oy}px`,
      }}
    />
  );
}

function ConnectorLayer({
  nodes,
  preset,
  activeNodeId,
}: {
  nodes: TextNode[];
  preset: Project["visualPreset"];
  activeNodeId?: string;
}) {
  if (preset.connectorStyle === "none" || nodes.length < 2) return null;
  const b = nodes.reduce(
    (acc, n) => ({
      minX: Math.min(acc.minX, n.x),
      minY: Math.min(acc.minY, n.y),
      maxX: Math.max(acc.maxX, n.x),
      maxY: Math.max(acc.maxY, n.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const pad = 600;
  const w = b.maxX - b.minX + pad * 2;
  const h = b.maxY - b.minY + pad * 2;
  const ox = b.minX - pad;
  const oy = b.minY - pad;

  const dash =
    preset.connectorStyle === "investigation"
      ? "0"
      : preset.connectorStyle === "tech"
      ? "2 6"
      : "0";
  const stroke =
    preset.connectorStyle === "investigation"
      ? preset.accentColor
      : preset.connectorStyle === "tech"
      ? preset.secondaryAccentColor
      : `color-mix(in oklab, ${preset.mutedTextColor} 60%, transparent)`;

  return (
    <svg
      className="absolute pointer-events-none"
      style={{ left: ox, top: oy, width: w, height: h }}
      viewBox={`${ox} ${oy} ${w} ${h}`}
    >
      {nodes.slice(1).map((n, i) => {
        const prev = nodes[i];
        const isActive = n.id === activeNodeId || prev.id === activeNodeId;
        const mid = { x: (prev.x + n.x) / 2, y: (prev.y + n.y) / 2 - 40 };
        return (
          <path
            key={n.id}
            d={`M ${prev.x} ${prev.y} Q ${mid.x} ${mid.y} ${n.x} ${n.y}`}
            fill="none"
            stroke={stroke}
            strokeWidth={isActive ? 1.4 : 0.8}
            strokeDasharray={dash}
            opacity={isActive ? 0.9 : 0.25}
          />
        );
      })}
    </svg>
  );
}

function NodeView({
  node,
  isActive,
  isSelected,
  relation,
  preset,
  onSelect,
  onDrag,
  screenToWorld: _screenToWorld,
  zoom,
}: {
  node: TextNode;
  isActive: boolean;
  isSelected: boolean;
  relation: "active" | "past" | "future";
  preset: Project["visualPreset"];
  onSelect: () => void;
  onDrag: (dx: number, dy: number) => void;
  screenToWorld: (x: number, y: number) => { x: number; y: number };
  zoom: number;
}) {
  void _screenToWorld;
  const draggingRef = useRef<{ sx: number; sy: number } | null>(null);

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

  // Hierarquia temporal — câmera trata ativo como protagonista absoluto.
  const depth = node.z * 60 * preset.depthIntensity;
  const stateOpacity =
    relation === "active" ? 1 : relation === "past" ? 0.18 : 0.28;
  const stateBlur =
    relation === "active"
      ? 0
      : (relation === "past" ? 6 : 4) * preset.blurIntensity;
  const depthBlur = Math.abs(node.z) * 1.4 * preset.blurIntensity;
  const stateScale =
    relation === "active"
      ? node.scale * 1.04
      : node.scale * (1 - Math.abs(node.z) * 0.08) * 0.92;

  // Tipografia cinematográfica — protagonista grande, contexto pequeno.
  const baseSize =
    node.variant === "headline"
      ? 96
      : node.variant === "accent"
      ? 68
      : node.variant === "caption"
      ? 22
      : 52;
  const fontSize = isActive ? baseSize : Math.round(baseSize * 0.78);

  const color =
    relation === "active"
      ? node.accentColor ??
        (node.variant === "accent" ? preset.accentColor : preset.textColor)
      : preset.textColor;

  const marker = node.markerStyle ?? preset.markerStyle;
  const glow = isActive
    ? `0 0 ${28 + preset.glowIntensity * 36}px color-mix(in oklab, ${preset.accentColor} ${
        24 + preset.glowIntensity * 40
      }%, transparent)`
    : "none";

  // Marcadores discretos — só ativos recebem cor de destaque.
  const markerColor = isActive ? preset.accentColor : preset.mutedTextColor;
  const markerOpacity = isActive ? 0.85 : 0.35;

  return (
    <div
      data-node={node.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="absolute cursor-pointer"
      style={{
        left: node.x,
        top: node.y,
        transform: `translate3d(-50%, -50%, ${depth}px) rotate(${node.rotation * (isActive ? 1 : 0.35)}deg) scale(${stateScale})`,
        opacity: node.opacity * stateOpacity,
        filter:
          stateBlur + depthBlur > 0.1
            ? `blur(${stateBlur + depthBlur}px)`
            : undefined,
        transition:
          "opacity 0.9s cubic-bezier(0.22,0.61,0.36,1), filter 0.9s cubic-bezier(0.22,0.61,0.36,1), transform 1.1s cubic-bezier(0.16,0.84,0.24,1)",
        maxWidth: isActive ? 880 : 640,
        zIndex: isActive ? 10 : 1,
      }}
    >
      <div
        className="relative px-6 py-3"
        style={{
          color,
          textShadow: glow,
          outline: isSelected ? `1px solid ${preset.accentColor}` : "none",
          outlineOffset: 12,
        }}
      >
        {marker === "bracket" && (
          <>
            <span
              aria-hidden
              className="absolute -left-4 top-2 bottom-2"
              style={{
                width: 14,
                borderLeft: `1px solid ${markerColor}`,
                borderTop: `1px solid ${markerColor}`,
                borderBottom: `1px solid ${markerColor}`,
                opacity: markerOpacity,
              }}
            />
            <span
              aria-hidden
              className="absolute -right-4 top-2 bottom-2"
              style={{
                width: 14,
                borderRight: `1px solid ${markerColor}`,
                borderTop: `1px solid ${markerColor}`,
                borderBottom: `1px solid ${markerColor}`,
                opacity: markerOpacity,
              }}
            />
          </>
        )}
        {marker === "vline" && (
          <span
            className="absolute -left-4 top-2 bottom-2"
            style={{
              width: 2,
              background: markerColor,
              opacity: markerOpacity,
            }}
          />
        )}
        {marker === "arrow" && isActive && (
          <span
            className="absolute -left-6 top-1/2 -translate-y-1/2 text-base"
            style={{ color: preset.accentColor, opacity: 0.85 }}
          >
            →
          </span>
        )}
        {marker === "dot" && (
          <span
            className="absolute -left-4 top-1/2 -translate-y-1/2 size-1.5 rounded-full"
            style={{ background: markerColor, opacity: markerOpacity }}
          />
        )}
        <div
          style={{
            fontSize,
            fontWeight: isActive ? Math.max(node.fontWeight, 500) : 400,
            lineHeight: 1.05,
            letterSpacing: "-0.025em",
            whiteSpace: "pre-wrap",
          }}
        >
          {node.shortText || node.text}
        </div>
        {isActive && node.variant !== "caption" && (
          <div
            className="mt-3 text-[10px] uppercase tracking-[0.42em]"
            style={{ color: preset.mutedTextColor, opacity: 0.6 }}
          >
            {node.type}
          </div>
        )}
      </div>
    </div>
  );
}

function SafeAreaOverlay({ area }: { area: "16:9" | "9:16" | "1:1" }) {
  const aspect = area === "16:9" ? 16 / 9 : area === "9:16" ? 9 / 16 : 1;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div
        className="border border-dashed"
        style={{
          aspectRatio: String(aspect),
          height: aspect >= 1 ? "78%" : "92%",
          maxWidth: "92%",
          borderColor: "oklch(1 0 0 / 0.18)",
        }}
      />
    </div>
  );
}

export type { CameraKeyframe };
