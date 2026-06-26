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
  /** Local object URL — não é persistido entre sessões. */
  objectUrl?: string;
}

export interface TranscriptWord {
  id: string;
  text: string;
  start: number; // seconds
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
  emphasis: number; // 0..1
  keywords: string[];
  originalWordIds: string[];
}

export interface TextNode {
  id: string;
  blockId: string;
  text: string;
  x: number;
  y: number;
  z: number; // depth for 2.5D
  scale: number;
  rotation: number;
  opacity: number;
  fontWeight: number;
  variant: "headline" | "body" | "caption" | "accent";
}

export interface CameraKeyframe {
  id: string;
  time: number;
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  focusNodeId?: string;
  ease: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "cinematic";
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
  volume: number; // 0..1
  blockId?: string;
}

export interface VisualPreset {
  id: string;
  name: string;
  background: string;
  accent: string;
  textColor: string;
  mutedColor: string;
  fontHeadline: string;
  fontBody: string;
  grain: number; // 0..1
  vignette: number;
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
}
