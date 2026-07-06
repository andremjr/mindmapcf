// Mirror of the canonical RenderExport shape produced by the Canvas Narrativo app.
// Kept loose (most fields optional) so the renderer is forgiving with old/partial JSONs.

export type CameraEase =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "cinematic";

export type NodeVariant = "headline" | "body" | "caption" | "accent";
export type MarkerStyle = "bracket" | "vline" | "arrow" | "dot" | "none";
export type NodeKind =
  | "hook"
  | "statement"
  | "evidence"
  | "quote"
  | "transition"
  | "conclusion";

export interface CameraTarget { x: number; y: number; zoom: number; }

export interface Chapter {
  index: number;
  title: string;
  color: string;
  startTime: number;
  endTime: number;
  startY: number;
  endY: number;
  blockIds: string[];
}

export interface TextNode {
  id: string;
  blockId: string;
  text: string;
  shortText?: string;
  type?: string;
  x: number;
  y: number;
  z?: number;
  scale?: number;
  opacity?: number;
  blur?: number;
  rotation?: number;
  accentColor?: string;
  markerStyle?: MarkerStyle;
  fontWeight?: number;
  variant?: NodeVariant;
  width?: number;
  height?: number;
  nodeKind?: NodeKind;
  emphasisWords?: string[];
  subtitle?: string;
  chapterIndex?: number;
  chapterColor?: string;
  cameraTarget?: CameraTarget;
  startTime?: number;
  endTime?: number;
}

export interface TranscriptBlock {
  id: string;
  text: string;
  shortText?: string;
  start: number;
  end: number;
  duration?: number;
  type?: string;
  emphasis?: number;
}

export interface CameraKeyframe {
  id: string;
  time: number;
  targetNodeId?: string;
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  duration: number;
  easing: CameraEase;
  focusIntensity: number;
  depthIntensity: number;
}

export interface SfxEvent {
  id: string;
  time: number;
  kind?: string;
  soundId?: string;
  volume: number;
  enabled?: boolean;
}

export interface SfxAsset {
  id: string;
  name: string;
  file: string;
  origin: "synth" | "public" | "user";
  license: string;
  author: string;
  sourceUrl: string;
}

export interface VisualPreset {
  id: string;
  name: string;
  backgroundColor: string;
  backgroundGradient?: string;
  gridStyle?: "none" | "dots" | "lines" | "lines3d";
  fontFamily: string;
  textColor: string;
  mutedTextColor: string;
  accentColor: string;
  secondaryAccentColor?: string;
  vignette?: number;
  grain?: number;
  glowIntensity?: number;
  blurIntensity?: number;
  depthIntensity?: number;
  shadowIntensity?: number;
}

export interface SoundPreset {
  id: string;
  name: string;
  masterVolume: number;
  intensity: number;
  duckOnSpeech?: boolean;
}

export interface RenderConfig {
  aspect: "horizontal" | "vertical" | "square";
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  safeArea: string;
  textScale: number;
  motionIntensity: number;
  depthIntensity: number;
  audioMixing: {
    speechGain: number;
    sfxGain: number;
    ambientGain: number;
    duckOnSpeech: boolean;
  };
}

export interface ProjectMeta {
  id: string;
  title: string;
  description?: string;
  durationSec: number;
}

export interface AudioFile {
  id: string;
  name: string;
  durationSec: number;
  mimeType?: string;
  objectUrl?: string;
  /** Local relative path inside public/ (added by renderer convention). */
  file?: string;
}

export interface CanvasNarrativoExport {
  schemaVersion?: number;
  exportedAt?: string;
  project: ProjectMeta;
  audio?: AudioFile | null;
  transcript?: unknown;
  transcriptBlocks: TranscriptBlock[];
  textNodes: TextNode[];
  cameraKeyframes: CameraKeyframe[];
  sfxEvents: SfxEvent[];
  visualPreset: VisualPreset;
  soundPreset: SoundPreset;
  renderConfig: RenderConfig;
  assetRegistry: SfxAsset[];
}

/** Default props used when no --props=./project.json is passed (studio preview). */
export const DEFAULT_PROPS: CanvasNarrativoExport = {
  schemaVersion: 1,
  project: {
    id: "demo",
    title: "Canvas Narrativo — Demo",
    durationSec: 12,
  },
  audio: null,
  transcriptBlocks: [
    { id: "b1", text: "Tudo começa com uma ideia.", start: 0, end: 3, emphasis: 0.7 },
    { id: "b2", text: "Mas a execução muda tudo.", start: 3, end: 7, emphasis: 0.9 },
    { id: "b3", text: "O resultado é o que importa.", start: 7, end: 12, emphasis: 1 },
  ],
  textNodes: [
    { id: "n1", blockId: "b1", text: "Tudo começa com uma ideia.", x: -600, y: -100, variant: "body" },
    { id: "n2", blockId: "b2", text: "Mas a execução muda tudo.", x: 200, y: 80, variant: "headline" },
    { id: "n3", blockId: "b3", text: "O resultado é o que importa.", x: 900, y: -50, variant: "accent" },
  ],
  cameraKeyframes: [
    { id: "k1", time: 0, x: -600, y: -100, zoom: 1.1, rotation: 0, duration: 2, easing: "cinematic", focusIntensity: 0.7, depthIntensity: 0.6 },
    { id: "k2", time: 3, x: 200, y: 80, zoom: 1.2, rotation: 0.01, duration: 2, easing: "cinematic", focusIntensity: 0.8, depthIntensity: 0.7 },
    { id: "k3", time: 7, x: 900, y: -50, zoom: 1.15, rotation: -0.01, duration: 2, easing: "cinematic", focusIntensity: 0.9, depthIntensity: 0.8 },
  ],
  sfxEvents: [],
  visualPreset: {
    id: "dark-documentary",
    name: "Dark Documentary",
    backgroundColor: "#0a0a0b",
    fontFamily: "'Inter', system-ui, sans-serif",
    textColor: "#f5f5f5",
    mutedTextColor: "#5a5a5a",
    accentColor: "#ff6a2b",
    vignette: 0.7,
    grain: 0.08,
    depthIntensity: 0.7,
  },
  soundPreset: {
    id: "documentary",
    name: "Documentary",
    masterVolume: 0.9,
    intensity: 0.8,
    duckOnSpeech: true,
  },
  renderConfig: {
    aspect: "horizontal",
    width: 1920,
    height: 1080,
    fps: 30,
    durationSec: 12,
    safeArea: "16:9",
    textScale: 1,
    motionIntensity: 0.6,
    depthIntensity: 0.7,
    audioMixing: { speechGain: 1, sfxGain: 0.85, ambientGain: 0.3, duckOnSpeech: true },
  },
  assetRegistry: [],
};
