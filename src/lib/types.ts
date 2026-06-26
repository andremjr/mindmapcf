// Canvas Narrativo — core domain types.

export type ProjectStatus =
  | "draft"
  | "audio_uploaded"
  | "transcribed"
  | "blocks_generated"
  | "canvas_generated"
  | "ready_to_render"
  | "exported";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Rascunho",
  audio_uploaded: "Áudio carregado",
  transcribed: "Transcrito",
  blocks_generated: "Blocos gerados",
  canvas_generated: "Canvas pronto",
  ready_to_render: "Pronto para render",
  exported: "Exportado",
};

export interface AudioFile {
  id: string;
  name: string;
  sizeBytes: number;
  durationSec: number;
  mimeType: string;
  objectUrl?: string;
}

export interface TranscriptWord {
  id: string;
  text: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface TranscriptParagraph {
  id: string;
  text: string;
  start: number;
  end: number;
  wordIds: string[];
}

export interface Transcript {
  id: string;
  language: string;
  durationSec: number;
  text: string;
  words: TranscriptWord[];
  paragraphs: TranscriptParagraph[];
  createdAt: string;
}

export type BlockType =
  | "intro"
  | "main_idea"
  | "detail"
  | "contrast"
  | "problem"
  | "solution"
  | "example"
  | "conclusion"
  | "warning";

export const BLOCK_TYPE_LABEL: Record<BlockType, string> = {
  intro: "Introdução",
  main_idea: "Ideia principal",
  detail: "Detalhe",
  contrast: "Contraste",
  problem: "Problema",
  solution: "Solução",
  example: "Exemplo",
  conclusion: "Conclusão",
  warning: "Alerta",
};

export interface TranscriptBlock {
  id: string;
  text: string;
  shortText: string;
  start: number;
  end: number;
  duration: number;
  type: BlockType;
  emphasis: number;
  keywords: string[];
  originalWordIds: string[];
}

export type MarkerStyle = "bracket" | "vline" | "arrow" | "dot" | "none";
export type NodeVariant = "headline" | "body" | "caption" | "accent";

export interface TextNode {
  id: string;
  blockId: string;
  text: string;
  shortText: string;
  type: BlockType;
  x: number;
  y: number;
  z: number;
  scale: number;
  opacity: number;
  blur: number;
  rotation: number;
  accentColor?: string;
  markerStyle: MarkerStyle;
  fontWeight: number;
  variant: NodeVariant;
}

export type CameraEase =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "cinematic";

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

export type SfxKind =
  | "whoosh"
  | "impact"
  | "tick"
  | "rise"
  | "drop"
  | "ambient"
  | "transition";

export interface SfxEvent {
  id: string;
  time: number;
  kind: SfxKind;
  volume: number;
  blockId?: string;
}

export type GridStyle = "none" | "dots" | "lines" | "lines3d";
export type ConnectorStyle = "minimal" | "investigation" | "tech" | "none";

export interface VisualPreset {
  id: string;
  name: string;
  backgroundColor: string;
  backgroundGradient?: string;
  gridStyle: GridStyle;
  fontFamily: string;
  textColor: string;
  mutedTextColor: string;
  accentColor: string;
  secondaryAccentColor: string;
  connectorStyle: ConnectorStyle;
  markerStyle: MarkerStyle;
  glowIntensity: number;
  blurIntensity: number;
  depthIntensity: number;
  shadowIntensity: number;
  cameraMovementIntensity: number;
  vignette: number;
  grain: number;
}

export interface SoundPreset {
  id: string;
  name: string;
  ambientTrack?: string;
  masterVolume: number;
  duckOnSpeech: boolean;
}

export interface RenderConfig {
  width: number;
  height: number;
  fps: number;
  format: "mp4" | "webm";
  quality: "draft" | "standard" | "high";
}

export type SafeArea = "16:9" | "9:16" | "1:1";

export interface Project {
  id: string;
  title: string;
  description?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  durationSec: number;
  audio?: AudioFile;
  transcript?: Transcript;
  blocks: TranscriptBlock[];
  nodes: TextNode[];
  camera: CameraKeyframe[];
  sfx: SfxEvent[];
  visualPreset: VisualPreset;
  soundPreset: SoundPreset;
  render: RenderConfig;
  safeArea?: SafeArea;
}
