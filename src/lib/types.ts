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

// ------------- SFX -------------

// Canonical SFX kinds requested by the project brief. Older shorthand kinds
// remain in the union for backwards compatibility with legacy data.
export type SfxKind =
  | "whoosh_soft"
  | "whoosh_deep"
  | "focus_click"
  | "text_pop"
  | "zoom_riser"
  | "low_impact"
  | "transition_air"
  | "subtle_hit"
  | "marker_tick"
  // legacy aliases
  | "whoosh"
  | "impact"
  | "tick"
  | "rise"
  | "drop"
  | "ambient"
  | "transition";

export type SfxTrigger =
  | "camera_move"
  | "node_focus"
  | "strong_idea"
  | "text_emphasis"
  | "zoom_in"
  | "zoom_out"
  | "transition"
  | "marker_reveal"
  | "manual";

export interface SfxEvent {
  id: string;
  time: number;
  /** Logical SFX type — maps to an entry in the asset registry. */
  kind: SfxKind;
  /** Reference to a concrete sound asset (registry id). Optional fallback to kind. */
  soundId?: string;
  volume: number;
  blockId?: string;
  nodeId?: string;
  trigger?: SfxTrigger;
  enabled?: boolean;
}

/**
 * SFX asset registry entry.
 *
 * IMPORTANT (legal): only ship assets with permissive licenses
 * (CC0, CC-BY, MIT, Apache). Always fill `license`, `author` and `sourceUrl`.
 * See `public/sfx/README.md` for how to add new sounds.
 */
export interface SfxAsset {
  id: string;
  name: string;
  kind: SfxKind;
  /** Public URL or relative path. `synth:*` means procedurally generated via Web Audio. */
  file: string;
  origin: "synth" | "public" | "user";
  license: "CC0" | "CC-BY" | "CC-BY-SA" | "MIT" | "Apache-2.0" | "mock";
  author: string;
  sourceUrl: string;
  attributionRequired: boolean;
  description?: string;
}

export interface SoundPreset {
  id: string;
  name: string;
  /** Master volume default (0–1). */
  masterVolume: number;
  /** Mapping of SFX kind → preferred asset id. */
  sounds: Partial<Record<SfxKind, string>>;
  /** How often auto-SFX triggers (0–1, 1 = on every block). */
  frequency: number;
  /** Overall sonic intensity (0–1). */
  intensity: number;
  playImpactOnStrongIdea: boolean;
  playClickOnNodeFocus: boolean;
  playWhooshOnCameraMove: boolean;
  duckOnSpeech: boolean;
  ambientTrack?: string;
}

// ------------- Visual presets -------------

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

// ------------- Render / Export -------------

export type SafeArea = "16:9" | "9:16" | "1:1";
export type RenderAspect = "horizontal" | "vertical" | "square";
export type RenderTarget = "remotion" | "hyperframes" | "generic";

export interface RenderConfig {
  aspect: RenderAspect;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  safeArea: SafeArea;
  textScale: number;
  motionIntensity: number;
  depthIntensity: number;
  audioMixing: {
    speechGain: number;
    sfxGain: number;
    ambientGain: number;
    duckOnSpeech: boolean;
  };
  exportTarget: RenderTarget;
  /** Output codec hint (used only by adapters that actually render). */
  format?: "mp4" | "webm";
  quality?: "draft" | "standard" | "high";
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
  safeArea?: SafeArea;
}
