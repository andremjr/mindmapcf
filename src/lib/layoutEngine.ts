import type { TextNode, TranscriptBlock, MarkerStyle } from "./types";

const DIRECTIONS = [
  { dx: 1, dy: 0.15 },
  { dx: 0.8, dy: -0.5 },
  { dx: 0.3, dy: 1 },
  { dx: -0.55, dy: 0.85 },
  { dx: -1, dy: 0.1 },
  { dx: -0.7, dy: -0.6 },
  { dx: 0.2, dy: -1 },
  { dx: 1, dy: 0.55 },
];

const MARKERS: MarkerStyle[] = ["bracket", "vline", "arrow", "dot"];

interface LayoutOptions {
  startX?: number;
  startY?: number;
  /** 0..1 — quanto a câmera "viaja" entre nós. */
  spread?: number;
  minDistance?: number;
  /** Seed para variar layouts a cada "Reorganizar". */
  seed?: number;
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Caminho narrativo pelo plano infinito.
 * - O primeiro bloco fica próximo de (0,0).
 * - Cada bloco escolhe uma direção que quebra a anterior.
 * - Mudança forte de assunto cria um "salto" de cluster.
 * - Nós próximos demais são empurrados para evitar sobreposição.
 */
export function autoLayout(
  blocks: TranscriptBlock[],
  opts: LayoutOptions = {},
): TextNode[] {
  const { spread = 1, minDistance = 280, seed = 1 } = opts;
  const rand = mulberry32(seed);
  const nodes: TextNode[] = [];

  let x = opts.startX ?? 0;
  let y = opts.startY ?? 0;
  let prevType: string | null = null;
  let lastDirIdx = -1;
  let cluster = 0;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];

    // Escolhe uma direção diferente da última, ignorando a oposta para
    // evitar zig-zag direto.
    let dirIdx = Math.floor(rand() * DIRECTIONS.length);
    if (dirIdx === lastDirIdx) dirIdx = (dirIdx + 1) % DIRECTIONS.length;
    lastDirIdx = dirIdx;
    const dir = DIRECTIONS[dirIdx];

    const lenBoost = Math.min(b.text.length, 180) * 1.4;
    const emphasisBoost = b.emphasis * 160;
    const stepLen = (380 + lenBoost + emphasisBoost) * spread;

    // Salto de cluster em mudança forte de assunto.
    const strongShift =
      prevType && prevType !== b.type && (b.type === "main_idea" || b.type === "contrast" || b.type === "conclusion");
    if (strongShift) {
      cluster++;
      x += dir.dx * 260 * spread;
      y += dir.dy * 260 * spread;
    }

    x += dir.dx * stepLen + (rand() - 0.5) * 80;
    y += dir.dy * stepLen + (rand() - 0.5) * 80;

    // Empurra para fora da vizinhança próxima dos últimos nós.
    for (let k = nodes.length - 1; k >= Math.max(0, nodes.length - 5); k--) {
      const p = nodes[k];
      const ddx = x - p.x;
      const ddy = y - p.y;
      const d = Math.hypot(ddx, ddy);
      if (d < minDistance) {
        const push = (minDistance - d) + 30;
        const nx = ddx / (d || 1);
        const ny = ddy / (d || 1);
        x += nx * push;
        y += ny * push;
      }
    }

    const variant: TextNode["variant"] =
      b.emphasis > 0.78
        ? "headline"
        : i % 5 === 0
        ? "accent"
        : b.shortText.length < 18
        ? "caption"
        : "body";

    nodes.push({
      id: `n_${b.id}`,
      blockId: b.id,
      text: b.text,
      shortText: b.shortText,
      type: b.type,
      x: Math.round(x),
      y: Math.round(y),
      z: ((i + cluster) % 3) - 1,
      scale: 0.85 + b.emphasis * 0.7,
      opacity: 1,
      blur: 0,
      rotation: Math.sin(i * 1.31 + cluster) * 2.2,
      markerStyle: MARKERS[i % MARKERS.length],
      fontWeight: b.emphasis > 0.6 ? 700 : variant === "caption" ? 400 : 500,
      variant,
    });

    prevType = b.type;
  }

  return nodes;
}

/** Bounding box útil para "Ver mapa completo" e safe areas. */
export function nodesBounds(nodes: TextNode[]) {
  if (nodes.length === 0) return { minX: -600, minY: -400, maxX: 600, maxY: 400 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  return { minX, minY, maxX, maxY };
}
