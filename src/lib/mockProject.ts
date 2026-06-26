import type {
  Project,
  TranscriptBlock,
  TextNode,
  CameraKeyframe,
  SfxEvent,
  VisualPreset,
  SoundPreset,
  RenderConfig,
} from "./types";

const DEFAULT_VISUAL: VisualPreset = {
  id: "vp_noir",
  name: "Noir Cinemático",
  background: "oklch(0.14 0.012 270)",
  accent: "oklch(0.78 0.16 220)",
  textColor: "oklch(0.96 0.01 250)",
  mutedColor: "oklch(0.62 0.02 260)",
  fontHeadline: "Inter",
  fontBody: "Inter",
  grain: 0.18,
  vignette: 0.35,
};

const DEFAULT_SOUND: SoundPreset = {
  id: "sp_room",
  name: "Sala Ambient",
  masterVolume: 0.8,
  duckOnSpeech: true,
};

const DEFAULT_RENDER: RenderConfig = {
  width: 1920,
  height: 1080,
  fps: 30,
  format: "mp4",
  quality: "standard",
};

const SAMPLE_BLOCKS: Array<Pick<TranscriptBlock, "text" | "shortText" | "type" | "emphasis">> = [
  { text: "Hoje eu quero te mostrar uma forma diferente de transformar áudio em vídeo.", shortText: "Transformar áudio em vídeo", type: "intro", emphasis: 0.7 },
  { text: "A maioria das ferramentas exige edição manual e muito tempo.", shortText: "Edição manual demora", type: "problem", emphasis: 0.6 },
  { text: "Mas existe um caminho mais elegante e cinematográfico.", shortText: "Caminho mais elegante", type: "contrast", emphasis: 0.55 },
  { text: "A ideia central é tratar texto como espaço.", shortText: "Texto como espaço", type: "main_idea", emphasis: 0.8 },
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
  { text: "Resumindo: texto vira imagem, e câmera vira narrativa.", shortText: "Texto vira imagem", type: "conclusion", emphasis: 0.9 },
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

function buildNodes(blocks: TranscriptBlock[]): TextNode[] {
  return blocks.map((b, i) => {
    // Espiral suave no canvas infinito.
    const angle = i * 0.7;
    const radius = 360 + i * 80;
    return {
      id: `n_${b.id}`,
      blockId: b.id,
      text: b.shortText,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      z: (i % 3) - 1,
      scale: 1 + b.emphasis * 0.8,
      rotation: (i % 5) * 1.5 - 3,
      opacity: 1,
      fontWeight: b.emphasis > 0.6 ? 700 : 500,
      variant: b.emphasis > 0.7 ? "headline" : i % 4 === 0 ? "accent" : "body",
    };
  });
}

function buildCamera(blocks: TranscriptBlock[], nodes: TextNode[]): CameraKeyframe[] {
  return blocks.map((b, i) => {
    const node = nodes[i];
    return {
      id: `cam_${i}`,
      time: b.start,
      x: node.x,
      y: node.y,
      zoom: 1 + b.emphasis * 0.6,
      rotation: node.rotation * 0.3,
      focusNodeId: node.id,
      ease: "cinematic",
    };
  });
}

function buildSfx(blocks: TranscriptBlock[]): SfxEvent[] {
  return blocks.flatMap((b, i) => {
    const evts: SfxEvent[] = [
      { id: `sfx_${i}_in`, time: b.start, kind: "whoosh", volume: 0.4, blockId: b.id },
    ];
    if (b.type === "warning" || b.type === "problem") {
      evts.push({ id: `sfx_${i}_imp`, time: b.start + 0.15, kind: "impact", volume: 0.55, blockId: b.id });
    }
    if (b.type === "conclusion") {
      evts.push({ id: `sfx_${i}_drop`, time: b.start, kind: "drop", volume: 0.7, blockId: b.id });
    }
    return evts;
  });
}

export function buildMockProject(): Project {
  const blocks = buildBlocks();
  const nodes = buildNodes(blocks);
  const camera = buildCamera(blocks, nodes);
  const sfx = buildSfx(blocks);
  const now = new Date().toISOString();
  return {
    id: "prj_demo",
    title: "Demo — Canvas Narrativo",
    description: "Projeto exemplo com transcrição mockada e camera path completa.",
    status: "canvas_generated",
    createdAt: now,
    updatedAt: now,
    durationSec: blocks[blocks.length - 1].end,
    audio: {
      id: "aud_demo",
      name: "demo-narration.mp3",
      sizeBytes: 1_840_000,
      durationSec: blocks[blocks.length - 1].end,
      mimeType: "audio/mpeg",
    },
    blocks,
    nodes,
    camera,
    sfx,
    visualPreset: DEFAULT_VISUAL,
    soundPreset: DEFAULT_SOUND,
    render: DEFAULT_RENDER,
  };
}

export const DEFAULT_VISUAL_PRESET = DEFAULT_VISUAL;
export const DEFAULT_SOUND_PRESET = DEFAULT_SOUND;
export const DEFAULT_RENDER_CONFIG = DEFAULT_RENDER;

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
    visualPreset: DEFAULT_VISUAL,
    soundPreset: DEFAULT_SOUND,
    render: DEFAULT_RENDER,
  };
}
