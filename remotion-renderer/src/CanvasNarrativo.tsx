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
} from "./types";
import { cameraAt } from "./cameraEngine";

const warned = new Set<string>();
function warnOnce(key: string, msg: string) {
  if (warned.has(key)) return;
  warned.add(key);
  // eslint-disable-next-line no-console
  console.warn(`[CanvasNarrativo] ${msg}`);
}

/** Resolve a path inside public/. Returns null if not provided. */
function resolvePublic(p?: string | null): string | null {
  if (!p) return null;
  // Allow already-absolute http(s) URLs
  if (/^https?:\/\//i.test(p)) return p;
  // Strip leading slash
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

  const bg = visualPreset?.backgroundColor ?? "#0a0a0b";
  const textColor = visualPreset?.textColor ?? "#f5f5f5";
  const mutedColor = visualPreset?.mutedTextColor ?? "#555";
  const accent = visualPreset?.accentColor ?? "#ff6a2b";
  const fontFamily =
    visualPreset?.fontFamily ?? "'Inter', system-ui, sans-serif";
  const vignette = visualPreset?.vignette ?? 0.6;
  const grain = visualPreset?.grain ?? 0;
  const depthIntensity = renderConfig?.depthIntensity ?? 0.7;

  // Camera transform: translate to center then offset by -cam.x/-cam.y, scale by zoom.
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

  return (
    <AbsoluteFill style={{ background: bg, fontFamily, overflow: "hidden" }}>
      {/* Infinite canvas layer */}
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
          {textNodes.map((n) => (
            <NodeView
              key={n.id}
              node={n}
              active={n.id === activeNodeId}
              activeBlockId={activeBlock?.id}
              textColor={textColor}
              mutedColor={mutedColor}
              accent={accent}
              depthIntensity={depthIntensity}
            />
          ))}
        </div>
      </AbsoluteFill>

      {/* Vignette */}
      {vignette > 0 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${vignette}) 100%)`,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Grain (cheap noise) */}
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

      {/* Main audio */}
      {audioSrc && <Audio src={audioSrc} />}

      {/* SFX */}
      {sfxEvents
        .filter((e) => e.enabled !== false)
        .map((e) => {
          const asset = assetRegistry.find((a) => a.id === e.soundId);
          if (!asset) {
            warnOnce(
              `sfx-no-asset-${e.id}`,
              `SFX ${e.id} sem asset (soundId=${e.soundId ?? "—"}). Pulando.`,
            );
            return null;
          }
          if (asset.origin === "synth") {
            warnOnce(
              `sfx-synth-${asset.id}`,
              `SFX ${asset.id} é synth (Web Audio) — não suportado no render server-side. Pulando.`,
            );
            return null;
          }
          const src = resolvePublic(asset.file);
          if (!src) {
            warnOnce(
              `sfx-missing-${asset.id}`,
              `Arquivo de SFX não encontrado: ${asset.file}. Pulando.`,
            );
            return null;
          }
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

function activeBlockAt(
  blocks: TranscriptBlock[],
  time: number,
): TranscriptBlock | undefined {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (time >= blocks[i].start) return blocks[i];
  }
  return blocks[0];
}

interface NodeViewProps {
  node: TextNode;
  active: boolean;
  activeBlockId?: string;
  textColor: string;
  mutedColor: string;
  accent: string;
  depthIntensity: number;
}

const NodeView: React.FC<NodeViewProps> = ({
  node,
  active,
  textColor,
  mutedColor,
  accent,
  depthIntensity,
}) => {
  const variant = node.variant ?? "body";
  const baseSize =
    variant === "headline" ? 96 : variant === "accent" ? 68 : variant === "caption" ? 36 : 52;
  const fontWeight = node.fontWeight ?? (variant === "headline" ? 600 : 500);

  const color = active ? textColor : mutedColor;
  const opacity = active ? 1 : 0.22;
  const blur = active ? 0 : 6 * depthIntensity;
  const scale = (node.scale ?? 1) * (active ? 1.04 : 1);

  const transform = `translate(${node.x}px, ${node.y}px) scale(${scale}) rotate(${node.rotation ?? 0}rad)`;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform,
        transformOrigin: "center",
        maxWidth: 1100,
        color,
        opacity,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        fontSize: baseSize,
        lineHeight: 1.05,
        letterSpacing: "-0.025em",
        fontWeight,
        textShadow: active ? "0 2px 30px rgba(0,0,0,0.6)" : undefined,
        transition: "none",
      }}
    >
      {/* Bracket marker */}
      {(node.markerStyle ?? "bracket") === "bracket" && (
        <span
          style={{
            display: "inline-block",
            width: 20,
            borderLeft: `1px solid ${active ? accent : mutedColor}`,
            opacity: active ? 0.85 : 0.35,
            height: baseSize * 1.1,
            verticalAlign: "middle",
            marginRight: 18,
          }}
        />
      )}
      <span style={variant === "accent" && active ? { color: accent } : undefined}>
        {node.text}
      </span>
    </div>
  );
};

// Helper so that delayRender/continueRender exist if needed for future fonts.
export const _renderHandle = { delayRender, continueRender };
