/**
 * Render export — Canvas Narrativo
 *
 * Gera um JSON final completo e validado, pronto para ser consumido por um
 * renderizador externo (Remotion, HyperFrames ou outro). Inclui o asset
 * registry de SFX com licenças explícitas.
 *
 * Como o JSON deve ser usado pelo renderizador:
 *  - Use `renderConfig.width/height/fps/durationSec` para configurar o canvas.
 *  - Itere pelos `cameraKeyframes` ordenados por `time`. Entre dois keyframes,
 *    interpole `(x, y, zoom, rotation)` usando o `easing` do keyframe destino.
 *    `focusIntensity` e `depthIntensity` controlam blur e paralaxe.
 *  - Aplique `visualPreset` no fundo, grid, cor de texto, glow, vignette e grain.
 *  - Posicione cada `TextNode` em `(x, y)` com `scale`, `rotation`, `opacity`,
 *    `blur` e `accentColor`. Variantes `headline | body | caption | accent`
 *    devem mapear para 4 estilos tipográficos distintos.
 *  - Para cada `SfxEvent` cujo `enabled !== false`, toque `soundId` em `time`,
 *    com volume `event.volume * soundPreset.intensity * renderConfig.audioMixing.sfxGain`.
 *    Se `audioMixing.duckOnSpeech`, abaixe o SFX em ~6dB durante blocos de fala.
 *  - Respeite o `renderConfig.safeArea` mantendo conteúdo crítico dentro de:
 *      16:9 → margem 5%   |   9:16 → margem 8% horiz, 12% vert   |   1:1 → margem 8%.
 *  - `assetRegistry` lista todos os SFX usados com licença/autor/URL para
 *    crédito automático na descrição do vídeo.
 */

import type {
  Project,
  RenderConfig,
  SfxAsset,
  SfxEvent,
  RenderAspect,
  Chapter,
} from "./types";
import { SFX_ASSETS, getAssetById } from "./sfxAssets";
import { validateCanvasLayout } from "./layoutEngine";


export interface RenderExport {
  schemaVersion: 1;
  exportedAt: string;
  project: Pick<Project, "id" | "title" | "description" | "status" | "createdAt" | "updatedAt" | "durationSec">;
  audio: Project["audio"] | null;
  transcript: Project["transcript"] | null;
  transcriptBlocks: Project["blocks"];
  textNodes: Project["nodes"];
  cameraKeyframes: Project["camera"];
  sfxEvents: SfxEvent[];
  visualPreset: Project["visualPreset"];
  soundPreset: Project["soundPreset"];
  renderConfig: RenderConfig;
  assetRegistry: SfxAsset[];
  chapters: Chapter[];
}

export interface ValidationIssue {
  level: "error" | "warning";
  message: string;
}

const ASPECT_DIMS: Record<RenderAspect, { w: number; h: number }> = {
  horizontal: { w: 1920, h: 1080 },
  vertical: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

export function aspectFromSafeArea(p: Project): RenderAspect {
  const a = p.safeArea ?? "16:9";
  if (a === "9:16") return "vertical";
  if (a === "1:1") return "square";
  return "horizontal";
}

export function ensureRenderConfig(p: Project): RenderConfig {
  const base = p.render;
  const aspect = base?.aspect ?? aspectFromSafeArea(p);
  const dims = ASPECT_DIMS[aspect];
  return {
    aspect,
    width: base?.width ?? dims.w,
    height: base?.height ?? dims.h,
    fps: base?.fps ?? 30,
    durationSec: p.durationSec,
    safeArea: base?.safeArea ?? p.safeArea ?? "16:9",
    textScale: base?.textScale ?? 1,
    motionIntensity: base?.motionIntensity ?? p.visualPreset.cameraMovementIntensity,
    depthIntensity: base?.depthIntensity ?? p.visualPreset.depthIntensity,
    audioMixing: base?.audioMixing ?? {
      speechGain: 1,
      sfxGain: 0.85,
      ambientGain: 0.3,
      duckOnSpeech: p.soundPreset.duckOnSpeech,
    },
    exportTarget: base?.exportTarget ?? "remotion",
    format: base?.format ?? "mp4",
    quality: base?.quality ?? "standard",
  };
}

export function buildExport(p: Project): RenderExport {
  const renderConfig = ensureRenderConfig(p);
  const usedAssetIds = new Set<string>();
  for (const e of p.sfx) {
    if (e.soundId) usedAssetIds.add(e.soundId);
  }
  const assetRegistry = SFX_ASSETS.filter((a) => usedAssetIds.has(a.id));
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    project: {
      id: p.id,
      title: p.title,
      description: p.description,
      status: p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      durationSec: p.durationSec,
    },
    audio: p.audio ?? null,
    transcript: p.transcript ?? null,
    transcriptBlocks: p.blocks,
    textNodes: p.nodes,
    cameraKeyframes: [...p.camera].sort((a, b) => a.time - b.time),
    sfxEvents: p.sfx.filter((e) => e.enabled !== false && e.time <= p.durationSec + 0.5),
    visualPreset: p.visualPreset,
    soundPreset: p.soundPreset,
    renderConfig,
    assetRegistry,
    chapters: p.chapters ?? [],
  };
}

export function validateExport(x: RenderExport): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!x.project.id) issues.push({ level: "error", message: "Project id ausente." });
  if (x.project.durationSec <= 0)
    issues.push({ level: "error", message: "Duração do projeto deve ser > 0." });
  if (x.transcriptBlocks.length === 0)
    issues.push({ level: "warning", message: "Nenhum bloco de transcrição." });
  if (x.textNodes.length === 0)
    issues.push({ level: "warning", message: "Nenhum TextNode no canvas." });
  if (x.cameraKeyframes.length === 0)
    issues.push({ level: "warning", message: "Nenhum keyframe de câmera." });

  for (const b of x.transcriptBlocks) {
    if (b.end <= b.start)
      issues.push({ level: "error", message: `Bloco ${b.id} tem duração inválida.` });
    if (b.text.length > 280)
      issues.push({ level: "warning", message: `Bloco ${b.id} tem texto muito longo (${b.text.length}).` });
  }
  for (const e of x.sfxEvents) {
    if (e.time < 0 || e.time > x.project.durationSec + 0.5)
      issues.push({ level: "warning", message: `SFX ${e.id} fora da duração.` });
    if (e.soundId && !getAssetById(e.soundId))
      issues.push({ level: "error", message: `SFX ${e.id} aponta para asset inexistente ${e.soundId}.` });
  }
  for (const a of x.assetRegistry) {
    if (!a.license || !a.author || !a.sourceUrl)
      issues.push({ level: "error", message: `Asset ${a.id} sem licença/autor/url.` });
  }
  if (x.renderConfig.fps < 12 || x.renderConfig.fps > 120)
    issues.push({ level: "warning", message: `FPS fora do intervalo recomendado (12–120).` });

  // Bloqueia render se houver sobreposição no canvas.
  const layoutCheck = validateCanvasLayout(x.textNodes, x.chapters ?? []);
  if (layoutCheck.overlaps.length > 0) {
    const sample = layoutCheck.overlaps.slice(0, 3)
      .map((o) => `${o.a}↔${o.b}`).join(", ");
    issues.push({
      level: "error",
      message: `Layout com ${layoutCheck.overlaps.length} sobreposição(ões) — rode "Gerar layout" novamente. Ex.: ${sample}`,
    });
  }
  return issues;
}


export function downloadJson(filename: string, data: unknown) {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyJson(data: unknown) {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  return true;
}
