import type {
  CameraKeyframe,
  TextNode,
  TranscriptBlock,
  CameraEase,
} from "./types";
import { nodesBounds } from "./layoutEngine";

interface BuildOptions {
  /** Frequência (segundos) entre wide-shots panorâmicos. 0 = desligado. */
  wideShotEvery?: number;
  movementIntensity?: number;
}

export function buildCameraKeyframes(
  blocks: TranscriptBlock[],
  nodes: TextNode[],
  opts: BuildOptions = {},
): CameraKeyframe[] {
  const { wideShotEvery = 35, movementIntensity = 0.45 } = opts;
  const keyframes: CameraKeyframe[] = [];
  const nodeByBlock = new Map(nodes.map((n) => [n.blockId, n]));
  const bounds = nodesBounds(nodes);
  const widePoint = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
  const wideExtent = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    1,
  );

  let lastWide = 0;

  blocks.forEach((b, i) => {
    const node = nodeByBlock.get(b.id);
    if (!node) return;

    // Zoom suave, sem variação brusca — sensação de câmera documental.
    const phase = i % 4;
    const baseZoom =
      phase === 0 ? 1.15 : phase === 1 ? 1.0 : phase === 2 ? 1.22 : 1.08;
    const zoom = baseZoom + b.emphasis * 0.18;
    const rotation = node.rotation * 0.08 * movementIntensity;
    const dur = Math.max(1.2, Math.min(b.duration * 0.9, 3.2));

    keyframes.push({
      id: `cam_${b.id}`,
      time: b.start,
      targetNodeId: node.id,
      x: node.x,
      y: node.y,
      zoom,
      rotation,
      duration: dur,
      easing: "cinematic",
      focusIntensity: 0.6 + b.emphasis * 0.4,
      depthIntensity: 0.55 + (i % 3) * 0.15,
    });

    // Wide-shot ocasional para arejar a câmera.
    if (wideShotEvery > 0 && b.start - lastWide >= wideShotEvery && i > 0) {
      const wideZoom = Math.max(0.3, Math.min(0.6, 1200 / wideExtent));
      keyframes.push({
        id: `cam_wide_${b.id}`,
        time: b.start - 0.5,
        x: widePoint.x,
        y: widePoint.y,
        zoom: wideZoom,
        rotation: 0,
        duration: 1.8,
        easing: "ease-in-out",
        focusIntensity: 0.2,
        depthIntensity: 1,
      });
      lastWide = b.start;
    }
  });

  return keyframes.sort((a, b) => a.time - b.time);
}

function easeFn(e: CameraEase): (t: number) => number {
  switch (e) {
    case "linear":
      return (t) => t;
    case "ease-in":
      return (t) => t * t;
    case "ease-out":
      return (t) => 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    case "cinematic":
    default:
      // Cubic with a slow tail — sensação de câmera com inércia.
      return (t) => {
        const k = 1 - Math.pow(1 - t, 3);
        return 0.85 * k + 0.15 * (t < 0.5 ? 2 * t * t : 1);
      };
  }
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  focusIntensity: number;
  depthIntensity: number;
  targetNodeId?: string;
}

const FALLBACK: CameraState = {
  x: 0,
  y: 0,
  zoom: 1,
  rotation: 0,
  focusIntensity: 0.6,
  depthIntensity: 0.6,
};

/** Interpola o estado da câmera no tempo t. */
export function cameraAt(
  keyframes: CameraKeyframe[],
  time: number,
): CameraState {
  if (keyframes.length === 0) return FALLBACK;
  if (time <= keyframes[0].time) return toState(keyframes[0]);
  if (time >= keyframes[keyframes.length - 1].time)
    return toState(keyframes[keyframes.length - 1]);

  let idx = 0;
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (time >= keyframes[i].time && time < keyframes[i + 1].time) {
      idx = i;
      break;
    }
  }
  const a = keyframes[idx];
  const b = keyframes[idx + 1];
  const span = Math.max(a.duration, b.time - a.time, 0.001);
  const local = Math.min(1, Math.max(0, (time - a.time) / span));
  const k = easeFn(b.easing)(local);

  return {
    x: lerp(a.x, b.x, k),
    y: lerp(a.y, b.y, k),
    zoom: lerp(a.zoom, b.zoom, k),
    rotation: lerp(a.rotation, b.rotation, k),
    focusIntensity: lerp(a.focusIntensity, b.focusIntensity, k),
    depthIntensity: lerp(a.depthIntensity, b.depthIntensity, k),
    targetNodeId: k < 0.5 ? a.targetNodeId : b.targetNodeId,
  };
}

function toState(k: CameraKeyframe): CameraState {
  return {
    x: k.x,
    y: k.y,
    zoom: k.zoom,
    rotation: k.rotation,
    focusIntensity: k.focusIntensity,
    depthIntensity: k.depthIntensity,
    targetNodeId: k.targetNodeId,
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Devolve o índice do bloco ativo em `time`. */
export function activeBlockAt(blocks: TranscriptBlock[], time: number): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (time >= blocks[i].start) return i;
  }
  return 0;
}
