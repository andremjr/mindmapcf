import type {
  Project,
  TranscriptBlock,
  RenderConfig,
} from "./types";
import { DEFAULT_VISUAL_PRESET } from "./presets";
import { DEFAULT_SOUND_PRESET } from "./sfxPresets";
import { autoLayout } from "./layoutEngine";
import { buildCameraKeyframes } from "./cameraEngine";
import { generateSfx } from "./sfxGenerator";

const DEFAULT_RENDER: RenderConfig = {
  aspect: "horizontal",
  width: 1920,
  height: 1080,
  fps: 30,
  durationSec: 0,
  safeArea: "16:9",
  textScale: 1,
  motionIntensity: 0.7,
  depthIntensity: 0.8,
  audioMixing: {
    speechGain: 1,
    sfxGain: 0.85,
    ambientGain: 0.3,
    duckOnSpeech: true,
  },
  exportTarget: "remotion",
  format: "mp4",
  quality: "standard",
};

const SAMPLE_BLOCKS: Array<Pick<TranscriptBlock, "text" | "shortText" | "type" | "emphasis">> = [
  { text: "Hoje eu quero te mostrar uma forma diferente de transformar áudio em vídeo.", shortText: "Transformar áudio em vídeo", type: "intro", emphasis: 0.7 },
  { text: "A maioria das ferramentas exige edição manual e muito tempo.", shortText: "Edição manual demora", type: "problem", emphasis: 0.6 },
  { text: "Mas existe um caminho mais elegante e cinematográfico.", shortText: "Caminho mais elegante", type: "contrast", emphasis: 0.55 },
  { text: "A ideia central é tratar texto como espaço.", shortText: "Texto como espaço", type: "main_idea", emphasis: 0.85 },
  { text: "Cada frase vira um bloco visual no canvas infinito.", shortText: "Frase vira bloco visual", type: "detail", emphasis: 0.45 },
  { text: "A câmera navega entre esses blocos com ritmo cinematográfico.", shortText: "Câmera com ritmo", type: "main_idea", emphasis: 0.7 },
  { text: "Por exemplo, palavras-chave ganham zoom no momento certo.", shortText: "Palavras-chave ganham zoom", type: "example", emphasis: 0.5 },
  { text: "Profundidade 2.5D dá sensação de mundo, sem usar imagens.", shortText: "Profundidade fake 2.5D", type: "detail", emphasis: 0.5 },
  { text: "Som sincronizado reforça transições e ênfases.", shortText: "Som sincronizado", type: "detail", emphasis: 0.55 },
  { text: "Atenção: blocos longos quebram o ritmo.", shortText: "Blocos longos quebram ritmo", type: "warning", emphasis: 0.75 },
  { text: "A solução é manter cada bloco entre 5 e 12 segundos.", shortText: "Blocos de 5 a 12 segundos", type: "solution", emphasis: 0.6 },
  { text: "Palavras-gatilho ajudam a classificar automaticamente cada bloco.", shortText: "Gatilhos classificam blocos", type: "detail", emphasis: 0.4 },
  { text: "O preset visual define cor, tipografia e atmosfera.", shortText: "Preset define atmosfera", type: "detail", emphasis: 0.45 },
  { text: "No final, exportamos um vídeo pronto, sem precisar de imagens.", shortText: "Exporta vídeo sem imagens", type: "solution", emphasis: 0.65 },
  { text: "Resumindo: texto vira imagem, e câmera vira narrativa.", shortText: "Texto vira imagem", type: "conclusion", emphasis: 0.95 },
];

function buildBlocks(): TranscriptBlock[] {
  const perBlock = 7.2;
  return SAMPLE_BLOCKS.map((b, i) => {
    const start = Number((i * perBlock).toFixed(2));
    const end = Number((start + perBlock - 0.3).toFixed(2));
    return {
      id: `blk_${i.toString().padStart(2, "0")}`,
      text: b.text,
      shortText: b.shortText,
      start,
      end,
      duration: end - start,
      type: b.type,
      emphasis: b.emphasis,
      keywords: b.shortText.toLowerCase().split(/\s+/).slice(0, 3),
      originalWordIds: [],
    };
  });
}

export function buildMockProject(): Project {
  const blocks = buildBlocks();
  const nodes = autoLayout(blocks, { seed: 7 });
  const camera = buildCameraKeyframes(blocks, nodes, { movementIntensity: 0.8 });
  const duration = blocks[blocks.length - 1].end;
  const sfx = generateSfx({ blocks, nodes, camera, preset: DEFAULT_SOUND_PRESET, durationSec: duration });
  const now = new Date().toISOString();
  return {
    id: "prj_demo",
    title: "Demo — Canvas Narrativo",
    description: "Projeto exemplo com transcrição mockada e camera path completa.",
    status: "canvas_generated",
    createdAt: now,
    updatedAt: now,
    durationSec: duration,
    audio: {
      id: "aud_demo",
      name: "demo-narration.mp3",
      sizeBytes: 1_840_000,
      durationSec: duration,
      mimeType: "audio/mpeg",
    },
    blocks,
    nodes,
    camera,
    sfx,
    visualPreset: DEFAULT_VISUAL_PRESET,
    soundPreset: DEFAULT_SOUND_PRESET,
    render: { ...DEFAULT_RENDER, durationSec: duration },
    safeArea: "16:9",
  };
}

export { DEFAULT_SOUND_PRESET } from "./sfxPresets";
export const DEFAULT_RENDER_CONFIG = DEFAULT_RENDER;
export { DEFAULT_VISUAL_PRESET };

export function buildEmptyProject(title: string): Project {
  const now = new Date().toISOString();
  return {
    id: `prj_${Math.random().toString(36).slice(2, 9)}`,
    title,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    durationSec: 0,
    blocks: [],
    nodes: [],
    camera: [],
    sfx: [],
    visualPreset: DEFAULT_VISUAL_PRESET,
    soundPreset: DEFAULT_SOUND_PRESET,
    render: DEFAULT_RENDER,
    safeArea: "16:9",
  };
}
