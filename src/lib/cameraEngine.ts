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
 * Constrói keyframes de câmera com o padrão pedido:
 *   • Durante a frase, a câmera fica PARADA e travada em zoom no nó atual.
 *   • Só se move entre uma frase e a próxima, num movimento curto
 *     (≤ 1s) do tipo "zoom out → pan → zoom in".
 *   • Usa os primeiros ~0.5s da frase apenas para *terminar* de aterrissar
 *     no nó — depois disso, trava até quase o final da frase.
 *
 * Por bloco emitimos:
 *   A) `focus_in`  em b.start + LAND        → NEAR no nó (chegada)
 *   B) `focus_hold` em max(A+ε, next.start − LAND) → NEAR no nó (imóvel)
 *   C) `mid`       (entre B e o próximo A)  → FAR no ponto médio (zoom-out
 *                                              + pan curto → próximo nó)
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

  const ZOOM_FAR = 0.6;
  const ZOOM_NEAR = 1.15;
  const LAND = 0.5;           // margem para terminar de focar no nó
  const MAX_MOVE = 1.0;       // duração máxima do movimento entre frases

  // 1) Abertura no root.
  if (rootNode) {
    keyframes.push({
      id: "cam_root",
      time: 0,
      targetNodeId: rootNode.id,
      x: rootNode.x + 220, y: rootNode.y, zoom: 0.55,
      rotation: 0,
      duration: 0.8,
      easing: "ease-in-out",
      focusIntensity: 0.35,
      depthIntensity: 0.6,
    });
    // Mantém o root parado até ~0.5s antes da primeira frase começar.
    const rootHoldAt = Math.max(0.4, firstStart - LAND);
    if (rootHoldAt > 0.4) {
      keyframes.push({
        id: "cam_root_hold",
        time: rootHoldAt,
        targetNodeId: rootNode.id,
        x: rootNode.x + 220, y: rootNode.y, zoom: 0.55,
        rotation: 0,
        duration: 0.1,
        easing: "linear",
        focusIntensity: 0.35,
        depthIntensity: 0.6,
      });
    }
  }

  blocks.forEach((b, idx) => {
    const node = nodeByBlock.get(b.id);
    if (!node) return;

    const emphasis = b.emphasis ?? 0.5;
    const near = Math.min(1.3, ZOOM_NEAR + emphasis * 0.05 * movementIntensity);

    const focusInTime = b.start + LAND;

    // A) Aterrissa no nó — trava zoom aqui.
    keyframes.push({
      id: `cam_in_${b.id}`,
      time: focusInTime,
      targetNodeId: node.id,
      x: node.x, y: node.y, zoom: near,
      rotation: 0,
      duration: LAND,
      easing: "ease-out",
      focusIntensity: 0.75 + emphasis * 0.25,
      depthIntensity: 0.55,
    });

    // B) Segura o foco parado (mesma pose) até ~0.5s antes da próxima frase.
    const next = blocks[idx + 1];
    const holdEndTime = next
      ? Math.max(focusInTime + 0.1, next.start - LAND)
      : Math.max(focusInTime + 0.2, b.end);

    if (holdEndTime > focusInTime + 0.05) {
      keyframes.push({
        id: `cam_hold_${b.id}`,
        time: holdEndTime,
        targetNodeId: node.id,
        x: node.x, y: node.y, zoom: near,
        rotation: 0,
        duration: 0.1,
        easing: "linear",
        focusIntensity: 0.75 + emphasis * 0.25,
        depthIntensity: 0.55,
      });
    }

    // C) Ponto médio da transição para a próxima frase — zoom out + pan curto.
    if (next) {
      const nextNode = nodeByBlock.get(next.id);
      if (nextNode) {
        const nextFocusIn = next.start + LAND;
        // Duração total do movimento (hold → próximo focus_in), limitada a 1s.
        const moveWindow = Math.min(MAX_MOVE, nextFocusIn - holdEndTime);
        // Ponto médio no tempo — pouco antes do start da próxima frase.
        const midT = holdEndTime + moveWindow / 2;
        keyframes.push({
          id: `cam_mid_${b.id}`,
          time: midT,
          x: (node.x + nextNode.x) / 2,
          y: (node.y + nextNode.y) / 2,
          zoom: ZOOM_FAR,
          rotation: 0,
          duration: moveWindow / 2,
          easing: "ease-in-out",
          focusIntensity: 0.4,
          depthIntensity: 0.75,
        });
      }
    }
  });

  // Reveal final do mapa.
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
      time: last.end + 0.3,
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      zoom: 0.4,
      rotation: 0,
      duration: 1.6,
      easing: "ease-in-out",
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
