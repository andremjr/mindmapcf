import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  Audio,
  staticFile,
  Sequence,
  continueRender,
  delayRender,
} from "remotion";
import type {
  CanvasNarrativoExport,
  TextNode,
  TranscriptBlock,
  NodeKind,
} from "./types";
import { cameraAt } from "./cameraEngine";

const warned = new Set<string>();
function warnOnce(key: string, msg: string) {
  if (warned.has(key)) return;
  warned.add(key);
  // eslint-disable-next-line no-console
  console.warn(`[CanvasNarrativo] ${msg}`);
}

// Legacy guide column; no longer used by tree layout.

function resolvePublic(p?: string | null): string | null {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  const clean = p.replace(/^\/+/, "");
  try {
    return staticFile(clean);
  } catch {
    return null;
  }
}

export const CanvasNarrativo: React.FC<CanvasNarrativoExport> = (props) => {
  const {
    textNodes = [],
    cameraKeyframes = [],
    transcriptBlocks = [],
    sfxEvents = [],
    visualPreset,
    renderConfig,
    audio,
    assetRegistry = [],
    
  } = props;

  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const time = frame / fps;

  const cam = cameraAt(cameraKeyframes, time);
  const activeBlock = activeBlockAt(transcriptBlocks, time);
  const activeNodeId =
    cam.targetNodeId ??
    (activeBlock ? textNodes.find((n) => n.blockId === activeBlock.id)?.id : undefined);

  const bg = visualPreset?.backgroundColor ?? "#08090c";
  const fontFamily =
    visualPreset?.fontFamily ?? "'Inter', system-ui, sans-serif";
  const vignette = visualPreset?.vignette ?? 0.65;
  const grain = visualPreset?.grain ?? 0;

  const cx = width / 2;
  const cy = height / 2;
  const transform = `translate(${cx}px, ${cy}px) scale(${cam.zoom}) rotate(${cam.rotation}rad) translate(${-cam.x}px, ${-cam.y}px)`;

  const audioSrc = resolvePublic(audio?.file ?? audio?.objectUrl ?? null);
  if (audio && !audioSrc) {
    warnOnce(
      "audio-missing",
      `Áudio principal não encontrado (${audio.file ?? audio.objectUrl ?? "sem caminho"}). Renderizando sem áudio.`,
    );
  }

  const bgGradient =
    visualPreset?.backgroundGradient ??
    `radial-gradient(ellipse at 50% 40%, ${lighten(bg, 6)} 0%, ${bg} 78%)`;

  return (
    <AbsoluteFill style={{ background: bgGradient, fontFamily, overflow: "hidden" }}>
      {/* World layer */}
      <AbsoluteFill>
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform,
            transformOrigin: "0 0",
            willChange: "transform",
          }}
        >
          <Connectors nodes={textNodes} />
          {textNodes.map((n) => (
            <NodeCardR
              key={n.id}
              node={n}
              active={n.id === activeNodeId}
            />
          ))}
        </div>
      </AbsoluteFill>

      {vignette > 0 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${vignette}) 100%)`,
            pointerEvents: "none",
          }}
        />
      )}
      {grain > 0 && (
        <AbsoluteFill
          style={{
            opacity: grain,
            mixBlendMode: "overlay",
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
            pointerEvents: "none",
          }}
        />
      )}

      {audioSrc && <Audio src={audioSrc} />}

      {sfxEvents
        .filter((e) => e.enabled !== false)
        .map((e) => {
          const asset = assetRegistry.find((a) => a.id === e.soundId);
          if (!asset) return null;
          if (asset.origin === "synth") return null;
          const src = resolvePublic(asset.file);
          if (!src) return null;
          const startFrame = Math.max(0, Math.round(e.time * fps));
          return (
            <Sequence key={e.id} from={startFrame}>
              <Audio src={src} volume={Math.max(0, Math.min(1, e.volume))} />
            </Sequence>
          );
        })}
    </AbsoluteFill>
  );
};

function activeBlockAt(blocks: TranscriptBlock[], time: number): TranscriptBlock | undefined {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (time >= blocks[i].start) return blocks[i];
  }
  return blocks[0];
}

// ---------- Curved connectors (mind map edges) ----------

const Connectors: React.FC<{ nodes: TextNode[] }> = ({ nodes }) => {
  if (!nodes.length) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const w = n.width ?? 320, h = n.height ?? 100;
    minX = Math.min(minX, n.x - w / 2);
    minY = Math.min(minY, n.y - h / 2);
    maxX = Math.max(maxX, n.x + w / 2);
    maxY = Math.max(maxY, n.y + h / 2);
  }
  const pad = 200;
  const svgLeft = minX - pad;
  const svgTop = minY - pad;
  const svgW = maxX - minX + pad * 2;
  const svgH = maxY - minY + pad * 2;

  const paths: React.ReactNode[] = [];
  for (const child of nodes) {
    if (!child.parentId) continue;
    const parent = byId.get(child.parentId);
    if (!parent) continue;
    const pw = parent.width ?? 320;
    const cw = child.width ?? 320;
    const sx = parent.x + pw / 2 - svgLeft;
    const sy = parent.y - svgTop;
    const tx = child.x - cw / 2 - svgLeft;
    const ty = child.y - svgTop;
    const dx = Math.max(60, (tx - sx) * 0.5);
    const d = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
    const color = child.chapterColor ?? "rgba(255,255,255,0.25)";
    paths.push(
      <g key={`c_${child.id}`}>
        <path d={d} stroke={color} strokeOpacity={0.2} strokeWidth={10} fill="none" strokeLinecap="round" />
        <path d={d} stroke={color} strokeOpacity={0.9} strokeWidth={2.6} fill="none" strokeLinecap="round" />
        <circle cx={sx} cy={sy} r={4} fill={color} />
        <circle cx={tx} cy={ty} r={4} fill={color} />
      </g>,
    );
  }
  return (
    <svg
      style={{
        position: "absolute",
        left: svgLeft,
        top: svgTop,
        width: svgW,
        height: svgH,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      {paths}
    </svg>
  );
};

// ---------- Nodes ----------

function highlight(text: string, words: string[] = [], color: string) {
  if (!words.length) return text;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
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
      <React.Fragment key={i}>{p}</React.Fragment>
    ),
  );
}

const NodeCardR: React.FC<{ node: TextNode; active: boolean }> = ({ node, active }) => {
  const kind: NodeKind = (node.nodeKind as NodeKind) ?? "statement";
  const color = node.chapterColor ?? node.accentColor ?? "#ff9f43";
  const width = node.width ?? 900;
  const height = node.height ?? 200;
  const text = node.shortText || node.text;
  const opacity = active ? 1 : 0.5;

  const container: React.CSSProperties = {
    position: "absolute",
    left: node.x - width / 2,
    top: node.y - height / 2,
    width,
    minHeight: height,
    opacity,
    filter: active ? "none" : "blur(0.5px)",
  };

  if (kind === "evidence") {
    return (
      <div style={container}>
        <div
          style={{
            background: "#141418",
            borderRadius: 24,
            border: `1px solid ${active ? color : "rgba(255,255,255,0.1)"}`,
            boxShadow: active ? `0 26px 80px ${color}30` : "0 12px 30px rgba(0,0,0,0.6)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              background: "#1c1c22",
              borderBottom: `1px solid ${color}55`,
              padding: "20px 32px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: 14, letterSpacing: "0.3em", color, fontWeight: 700 }}>
              ▍ FONTE / DOCUMENTO
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontFamily: "ui-monospace, monospace" }}>
              REF · {node.blockId.slice(0, 6).toUpperCase()}
            </div>
          </div>
          <div style={{ padding: "36px 40px" }}>
            <div
              style={{
                fontSize: 22,
                color: "rgba(255,255,255,0.5)",
                marginBottom: 16,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              Trecho documental
            </div>
            <div
              style={{
                fontSize: 44,
                fontWeight: 500,
                lineHeight: 1.2,
                letterSpacing: "-0.02em",
                color: "#f5f5f5",
              }}
            >
              {highlight(text, node.emphasisWords, color)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "quote") {
    return (
      <div style={container}>
        <div
          style={{
            background: "#0f0f13",
            borderRadius: 28,
            border: `1px solid ${active ? color + "aa" : "rgba(255,255,255,0.08)"}`,
            padding: "48px 60px",
            boxShadow: active ? `0 26px 80px ${color}25` : "0 12px 30px rgba(0,0,0,0.6)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 6,
              left: 24,
              fontSize: 150,
              color: color + "44",
              fontFamily: "serif",
              lineHeight: 1,
            }}
          >
            “
          </div>
          <div
            style={{
              fontSize: width > 900 ? 60 : 52,
              fontWeight: 500,
              lineHeight: 1.18,
              letterSpacing: "-0.02em",
              fontStyle: "italic",
              color: "#f5f5f5",
              paddingLeft: 34,
            }}
          >
            {text}
          </div>
        </div>
      </div>
    );
  }

  if (kind === "transition") {
    return (
      <div style={container}>
        <div
          style={{
            padding: "28px 44px",
            borderLeft: `4px solid ${color}`,
            color: active ? "#f5f5f5" : "rgba(245,245,245,0.7)",
          }}
        >
          <div style={{ fontSize: 14, letterSpacing: "0.4em", color, marginBottom: 14, fontWeight: 700 }}>
            ⏵ TRANSIÇÃO
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 500,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              textShadow: active ? `0 0 30px ${color}44` : "none",
            }}
          >
            {text}
          </div>
        </div>
      </div>
    );
  }

  const isHero = kind === "hook" || kind === "conclusion";
  const fontSize = kind === "hook" ? 82 : kind === "conclusion" ? 66 : 52;
  return (
    <div style={container}>
      <div
        style={{
          background: isHero ? "linear-gradient(135deg, #111114, #16161a)" : "#111114",
          borderRadius: 28,
          border: `1px solid ${active ? color : "rgba(255,255,255,0.08)"}`,
          boxShadow: active ? `0 26px 80px ${color}30` : "0 12px 30px rgba(0,0,0,0.6)",
          padding: "44px 52px",
          minHeight: height,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {isHero && (
          <div
            style={{
              fontSize: 14,
              letterSpacing: "0.35em",
              color,
              marginBottom: 22,
              fontWeight: 700,
            }}
          >
            ▍ {kind === "hook" ? "GANCHO" : "CONCLUSÃO"}
          </div>
        )}
        <div
          style={{
            fontSize,
            fontWeight: isHero ? 700 : 500,
            lineHeight: 1.12,
            letterSpacing: "-0.025em",
            color: "#f5f5f5",
          }}
        >
          {highlight(text, node.emphasisWords, color)}
        </div>
      </div>
    </div>
  );
};

// ---------- Utils ----------

function lighten(hex: string, amt: number): string {
  // aceita #rrggbb ou oklch/other; se não conseguir, retorna original.
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + amt);
  const g = Math.min(255, ((n >> 8) & 0xff) + amt);
  const b = Math.min(255, (n & 0xff) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export const _renderHandle = { delayRender, continueRender };
