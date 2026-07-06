import type {
  CameraKeyframe,
  TextNode,
  TranscriptBlock,
  CameraEase,
} from "./types";

interface BuildOptions {
  movementIntensity?: number;
  /** Frequência (segundos) entre wide-shots panorâmicos. 0 = desligado. */
  wideShotEvery?: number;
}

/**
 * Constrói keyframes de câmera para o Canvas Narrativo v2.
 * A câmera desliza suavemente pelo canvas vertical, respeitando o
 * cameraTarget calculado no layout (posição + zoom por tipo de nó).
 */
export function buildCameraKeyframes(
  blocks: TranscriptBlock[],
  nodes: TextNode[],
  opts: BuildOptions = {},
): CameraKeyframe[] {
  const { movementIntensity = 0.5, wideShotEvery = 0 } = opts;
  const nodeByBlock = new Map(nodes.map((n) => [n.blockId, n]));
  const keyframes: CameraKeyframe[] = [];

  blocks.forEach((b, i) => {
    const node = nodeByBlock.get(b.id);
    if (!node) return;

    const tgt = node.cameraTarget ?? { x: node.x, y: node.y, zoom: 1 };
    const zoomBoost = 1 + b.emphasis * 0.06 * movementIntensity;
    const zoom = Math.max(0.55, Math.min(1.25, tgt.zoom * zoomBoost));
    const dur = Math.max(1.4, Math.min(b.duration * 0.9, 3.4));

    // Micro-easing: cinematográfico para maioria, ease-in-out para transições.
    const easing: CameraEase =
      node.nodeKind === "transition" ? "ease-in-out" : "cinematic";

    keyframes.push({
      id: `cam_${b.id}`,
      time: b.start,
      targetNodeId: node.id,
      x: tgt.x,
      y: tgt.y,
      zoom,
      rotation: 0,
      duration: dur,
      easing,
      focusIntensity: 0.6 + b.emphasis * 0.4,
      depthIntensity: 0.55,
    });

    // Wide-shot ocasional em mudança de capítulo (se pedido).
    if (
      wideShotEvery > 0 &&
      i > 0 &&
      nodes[i - 1]?.chapterIndex !== node.chapterIndex &&
      (b.start - (keyframes[keyframes.length - 2]?.time ?? 0)) >= wideShotEvery
    ) {
      keyframes.push({
        id: `cam_wide_${b.id}`,
        time: Math.max(0, b.start - 0.6),
        x: tgt.x,
        y: tgt.y - 220,
        zoom: 0.7,
        rotation: 0,
        duration: 1.6,
        easing: "ease-in-out",
        focusIntensity: 0.2,
        depthIntensity: 1,
      });
    }
  });

  return keyframes.sort((a, b) => a.time - b.time);
}

// ---------- Interpolação (usada pelo preview e pelo Remotion) ----------

function easeFn(e: CameraEase): (t: number) => number {
  switch (e) {
    case "linear": return (t) => t;
    case "ease-in": return (t) => t * t;
    case "ease-out": return (t) => 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    case "cinematic":
    default:
      return (t) => 1 - Math.pow(1 - t, 5);
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
  const span = Math.max(b.time - a.time, 0.001);
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

export function activeBlockAt(blocks: TranscriptBlock[], time: number): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (time >= blocks[i].start) return i;
  }
  return 0;
}
