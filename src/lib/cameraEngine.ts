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
  const { movementIntensity = 0.5 } = opts;
  const nodeByBlock = new Map(nodes.map((n) => [n.blockId, n]));
  const keyframes: CameraKeyframe[] = [];

  const rootNode = nodes.find((n) => n.nodeKind === "root");
  const firstStart = blocks[0]?.start ?? 0;

  // 1) Root reveal — showcase the whole left side of the mind map.
  if (rootNode) {
    const tgt = rootNode.cameraTarget ?? { x: rootNode.x, y: rootNode.y, zoom: 0.55 };
    keyframes.push({
      id: "cam_root",
      time: 0,
      targetNodeId: rootNode.id,
      x: tgt.x, y: tgt.y, zoom: tgt.zoom,
      rotation: 0,
      duration: Math.max(1.2, Math.min(firstStart, 2.5)),
      easing: "cinematic",
      focusIntensity: 0.4,
      depthIntensity: 0.6,
    });
  }

  let prevChapter: number | undefined;

  blocks.forEach((b) => {
    const node = nodeByBlock.get(b.id);
    if (!node) return;

    // Branch overview when entering a new main idea group.
    if (node.chapterIndex !== undefined && prevChapter !== node.chapterIndex) {
      const mainIdea = nodes.find(
        (n) => n.nodeKind === "mainIdea" && n.chapterIndex === node.chapterIndex,
      );
      if (mainIdea) {
        keyframes.push({
          id: `cam_branch_${node.chapterIndex}`,
          time: Math.max(0, b.start - 0.4),
          targetNodeId: mainIdea.id,
          x: mainIdea.x + 260,
          y: mainIdea.y,
          zoom: 0.7,
          rotation: 0,
          duration: 1.2,
          easing: "ease-in-out",
          focusIntensity: 0.35,
          depthIntensity: 0.8,
        });
      }
      prevChapter = node.chapterIndex;
    }

    const tgt = node.cameraTarget ?? { x: node.x, y: node.y, zoom: 1 };
    const zoomBoost = 1 + (b.emphasis ?? 0.5) * 0.06 * movementIntensity;
    const zoom = Math.max(0.5, Math.min(1.3, tgt.zoom * zoomBoost));
    const dur = Math.max(1.2, Math.min(b.duration * 0.9, 3.0));

    keyframes.push({
      id: `cam_${b.id}`,
      time: b.start,
      targetNodeId: node.id,
      x: tgt.x, y: tgt.y, zoom,
      rotation: 0,
      duration: dur,
      easing: "cinematic",
      focusIntensity: 0.6 + (b.emphasis ?? 0.5) * 0.4,
      depthIntensity: 0.55,
    });
  });

  // Final full-map reveal.
  if (nodes.length > 0 && blocks.length > 0) {
    const last = blocks[blocks.length - 1];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const w = n.width ?? 320, h = n.height ?? 100;
      minX = Math.min(minX, n.x - w / 2); maxX = Math.max(maxX, n.x + w / 2);
      minY = Math.min(minY, n.y - h / 2); maxY = Math.max(maxY, n.y + h / 2);
    }
    keyframes.push({
      id: "cam_final",
      time: last.end + 0.1,
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      zoom: 0.4,
      rotation: 0,
      duration: 2,
      easing: "cinematic",
      focusIntensity: 0.3,
      depthIntensity: 1,
    });
  }

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
