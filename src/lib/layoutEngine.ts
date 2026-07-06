import type {
  TextNode,
  TranscriptBlock,
  NodeKind,
  Chapter,
} from "./types";

/**
 * Canvas Narrativo — Horizontal Mind Map Layout Engine (v3).
 *
 * Organiza os blocos narrativos numa árvore horizontal ramificada:
 *   root (tema central)  →  ideias principais  →  subtópicos  →  detalhes
 *
 * Estilo visual: mapa mental profissional, ramos indo da esquerda para a
 * direita, conexões em curvas Bézier suaves, zero sobreposição.
 */

// ---------- Canvas / geometria ----------

export const CANVAS = {
  /** X central de cada coluna (por profundidade). */
  columns: [220, 780, 1250, 1730] as const,
  /** Espaçamento vertical mínimo entre ramificações no mesmo nível. */
  gapMain: 260,
  gapSub: 150,
  gapDetail: 110,
  /** Margem mínima entre qualquer par de cards. */
  minCardGap: 60,
  /** Padding topo do canvas (world-space). */
  topPad: 240,
  /** Padding lateral (informativo). */
  safePadX: 120,
  /** Compat: chaves antigas usadas por partes do app; deprecated. */
  width: 2200,
  guideX: 0,
  startY: 0,
  contentCx: 1000,
  gapMin: 220,
  gapChapter: 700,
  gapHook: 420,
  gapEvidence: 360,
  collisionStep: 100,
  collisionPad: 30,
};

const CHAPTER_PALETTE = [
  "#ff4d6d", "#ff9f43", "#ffd23f", "#4facfe", "#a78bfa", "#34d399",
];

const CHAPTER_TITLES = [
  "O GANCHO", "A HISTÓRIA", "AS PROVAS", "O PROBLEMA",
  "A ANÁLISE", "A REVELAÇÃO", "A REFLEXÃO", "A CONCLUSÃO",
];

const STOP_PT = new Set(
  "a o e é de da do das dos que com sem para por sobre em na no nas nos os as um uma uns umas foi ser são será tem têm mais menos como quando onde porque porquê pois mas nem só ainda sempre também isso isto aquilo aquele aquela esse essa este esta seu sua seus suas meu minha nós vocês eles elas".split(
    /\s+/,
  ),
);

// ---------- Sizing ----------

interface Size { w: number; h: number; }

// Largura-alvo por tipo de nó. A altura cresce em função do texto real
// (frases completas), para caber uma sentença inteira sem cortar.
const NODE_WIDTH: Partial<Record<NodeKind, number>> = {
  root: 520,
  mainIdea: 480,
  subtopic: 460,
  detail: 420,
  evidence: 560,
  quote: 460,
  conclusion: 460,
  hook: 480,
  statement: 440,
  transition: 380,
};

// Aproxima quantos caracteres cabem por linha na largura útil do card.
function approxCharsPerLine(widthPx: number, fontSize: number): number {
  const usable = widthPx - 56; // padding horizontal
  const avgCharPx = fontSize * 0.55;
  return Math.max(12, Math.floor(usable / avgCharPx));
}

function fontSizeFor(kind: NodeKind): number {
  switch (kind) {
    case "root": return 32;
    case "mainIdea": return 24;
    case "subtopic": return 22;
    case "evidence": return 22;
    case "quote": return 24;
    case "conclusion": return 24;
    case "hook": return 26;
    default: return 20;
  }
}

function measureBox(kind: NodeKind, text: string): Size {
  const w = NODE_WIDTH[kind] ?? 420;
  const fs = fontSizeFor(kind);
  const lineHeight = fs * 1.35;
  const cpl = approxCharsPerLine(w, fs);
  const chars = Math.max(1, text.length);
  const lines = Math.max(2, Math.ceil(chars / cpl));
  const padY = kind === "evidence" ? 72 : 60;
  const h = clamp(110, Math.round(lines * lineHeight + padY), 460);
  return { w, h };
}

function clamp(min: number, v: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// ---------- Text — usa a frase completa ----------

// Tema central continua sendo derivado (não é uma frase); demais nós recebem
// a frase COMPLETA vinda do bloco (uma sentença = um nó).
function nodeTextFromBlock(block: TranscriptBlock): string {
  return (block.text ?? block.shortText ?? "").trim();
}

function deriveRootText(blocks: TranscriptBlock[]): string {
  // Junta as palavras-chave mais frequentes dos primeiros blocos.
  const freq = new Map<string, number>();
  const all = blocks.slice(0, Math.min(blocks.length, 8));
  for (const b of all) {
    const tokens = (b.shortText || b.text)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 3 && !STOP_PT.has(t));
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const top = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w[0].toUpperCase() + w.slice(1));
  if (top.length === 0) return "TEMA CENTRAL";
  return top.join(" · ");
}

// ---------- Chapter detection ----------

function detectChapters(blocks: TranscriptBlock[]): number[][] {
  if (blocks.length === 0) return [];
  const total = blocks.length;
  const target =
    total <= 4 ? Math.max(2, total)
    : total <= 8 ? 3
    : total <= 15 ? 4
    : total <= 25 ? 5
    : 6;

  const scores: number[] = [];
  for (let i = 0; i < total - 1; i++) {
    const a = blocks[i]; const b = blocks[i + 1];
    const gap = Math.max(0, b.start - a.end);
    const typeShift = a.type !== b.type ? 1 : 0;
    const strong =
      b.type === "main_idea" || b.type === "contrast" ||
      b.type === "conclusion" || b.type === "problem" ? 1.2 : 0;
    scores.push(gap * 1.2 + typeShift * 0.8 + strong);
  }

  const minPer = Math.max(1, Math.floor(total / (target * 2)));
  const cuts = new Set<number>();
  const sorted = scores.map((s, i) => ({ i, s })).sort((a, b) => b.s - a.s);
  for (const { i } of sorted) {
    if (cuts.size >= target - 1) break;
    let ok = true;
    for (const c of cuts) if (Math.abs(c - i) < minPer) { ok = false; break; }
    if (i < minPer - 1 || i > total - 1 - minPer) ok = false;
    if (ok) cuts.add(i);
  }
  const cutList = Array.from(cuts).sort((a, b) => a - b);
  const groups: number[][] = [];
  let start = 0;
  for (const c of cutList) { groups.push(range(start, c + 1)); start = c + 1; }
  groups.push(range(start, total));
  return groups.filter((g) => g.length > 0);
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i < b; i++) out.push(i);
  return out;
}

// ---------- Tree types ----------

interface TNode {
  id: string;
  blockId: string;
  block?: TranscriptBlock;
  kind: NodeKind;
  depth: number;
  parentId?: string;
  chapterIndex: number;
  chapterColor: string;
  text: string;
  shortText: string;
  w: number;
  h: number;
  x: number;
  y: number;
  children: TNode[];
}

// ---------- Recursive layout ----------

function gapForDepth(depth: number): number {
  if (depth === 1) return CANVAS.gapMain;
  if (depth === 2) return CANVAS.gapSub;
  return CANVAS.gapDetail;
}

function subtreeHeight(n: TNode): number {
  if (n.children.length === 0) return n.h + CANVAS.minCardGap;
  let sum = 0;
  for (let i = 0; i < n.children.length; i++) {
    if (i > 0) sum += gapForDepth(n.children[i].depth);
    sum += subtreeHeight(n.children[i]);
  }
  return Math.max(sum, n.h + CANVAS.minCardGap);
}

function place(n: TNode, topY: number) {
  n.x = CANVAS.columns[Math.min(n.depth, CANVAS.columns.length - 1)];
  const total = subtreeHeight(n);
  if (n.children.length === 0) {
    n.y = topY + total / 2;
    return;
  }
  // Total height children need.
  let childrenH = 0;
  for (let i = 0; i < n.children.length; i++) {
    if (i > 0) childrenH += gapForDepth(n.children[i].depth);
    childrenH += subtreeHeight(n.children[i]);
  }
  let cursor = topY + Math.max(0, (total - childrenH) / 2);
  const centers: number[] = [];
  for (let i = 0; i < n.children.length; i++) {
    const c = n.children[i];
    if (i > 0) cursor += gapForDepth(c.depth);
    place(c, cursor);
    centers.push(c.y);
    cursor += subtreeHeight(c);
  }
  n.y = (centers[0] + centers[centers.length - 1]) / 2;
}

// ---------- Tree building from blocks ----------

const MAX_MAIN_IDEAS = 6;

function buildTree(blocks: TranscriptBlock[]): TNode {
  const rootText = deriveRootText(blocks);
  const rootSize = measureBox("root", rootText);
  const root: TNode = {
    id: "n_root",
    blockId: "root",
    kind: "root",
    depth: 0,
    chapterIndex: 0,
    chapterColor: "#ffffff",
    text: rootText,
    shortText: rootText,
    w: rootSize.w,
    h: rootSize.h,
    x: 0, y: 0,
    children: [],
  };

  let groups = detectChapters(blocks);
  // Cap number of main ideas — merge trailing groups if excess.
  if (groups.length > MAX_MAIN_IDEAS) {
    const kept = groups.slice(0, MAX_MAIN_IDEAS - 1);
    const merged = groups.slice(MAX_MAIN_IDEAS - 1).flat();
    groups = [...kept, merged];
  }

  groups.forEach((group, cIdx) => {
    const color = CHAPTER_PALETTE[cIdx % CHAPTER_PALETTE.length];
    const [mainIdx, ...restIdx] = group;
    const mainBlock = blocks[mainIdx];
    const mainText = nodeTextFromBlock(mainBlock);
    const mainNode: TNode = {
      id: `n_${mainBlock.id}`,
      blockId: mainBlock.id,
      block: mainBlock,
      kind: "mainIdea",
      depth: 1,
      parentId: root.id,
      chapterIndex: cIdx,
      chapterColor: color,
      text: mainText,
      shortText: mainText,
      ...measureBox("mainIdea", mainText),
      x: 0, y: 0,
      children: [],
    };

    // Subtopics + details
    const subCount = Math.min(3, restIdx.length);
    const subs: TNode[] = [];
    for (let i = 0; i < subCount; i++) {
      const b = blocks[restIdx[i]];
      const t = b.shortText || b.text;
      const st = shortenText(t, "subtopic");
      const sub: TNode = {
        id: `n_${b.id}`,
        blockId: b.id,
        block: b,
        kind: "subtopic",
        depth: 2,
        parentId: mainNode.id,
        chapterIndex: cIdx,
        chapterColor: color,
        text: t,
        shortText: st,
        ...measureBox("subtopic", st),
        x: 0, y: 0,
        children: [],
      };
      subs.push(sub);
    }
    for (let i = subCount; i < restIdx.length; i++) {
      const b = blocks[restIdx[i]];
      const kind: NodeKind =
        b.type === "example" || b.type === "warning" ? "evidence" : "detail";
      const owner = subs[(i - subCount) % Math.max(1, subs.length)];
      if (!owner) continue;
      const t = b.shortText || b.text;
      const st = shortenText(t, kind);
      const det: TNode = {
        id: `n_${b.id}`,
        blockId: b.id,
        block: b,
        kind,
        depth: 3,
        parentId: owner.id,
        chapterIndex: cIdx,
        chapterColor: color,
        text: t,
        shortText: st,
        ...measureBox(kind, st),
        x: 0, y: 0,
        children: [],
      };
      owner.children.push(det);
    }
    mainNode.children = subs;
    root.children.push(mainNode);
  });

  return root;
}

// ---------- Camera targets per node ----------

function cameraTargetFor(n: TNode): { x: number; y: number; zoom: number } {
  switch (n.kind) {
    case "root":
      return { x: n.x + 260, y: n.y, zoom: 0.55 };
    case "mainIdea":
      return { x: n.x + 150, y: n.y, zoom: 0.85 };
    case "subtopic":
      return { x: n.x, y: n.y, zoom: 1.0 };
    case "detail":
      return { x: n.x, y: n.y, zoom: 1.15 };
    case "evidence":
      return { x: n.x, y: n.y, zoom: 0.75 };
    default:
      return { x: n.x, y: n.y, zoom: 1.0 };
  }
}

// ---------- Public API ----------

export interface NodeDebugInfo {
  id: string;
  kind: NodeKind;
  depth: number;
  parentId?: string;
  x: number; y: number;
  w: number; h: number;
  childCount: number;
  chapterIndex: number;
}

export interface LayoutDebug {
  totalNodes: number;
  totalCollisionsDetected: number;
  totalCollisionsResolved: number;
  chaptersCount: number;
  canvasHeight: number;
  nodes: NodeDebugInfo[];
}

export interface LayoutResult {
  nodes: TextNode[];
  chapters: Chapter[];
  debug: LayoutDebug;
}

export function autoLayoutFull(
  blocks: TranscriptBlock[],
  _opts: { seed?: number } = {},
): LayoutResult {
  if (blocks.length === 0) {
    return {
      nodes: [], chapters: [],
      debug: {
        totalNodes: 0, totalCollisionsDetected: 0, totalCollisionsResolved: 0,
        chaptersCount: 0, canvasHeight: 0, nodes: [],
      },
    };
  }

  const root = buildTree(blocks);
  place(root, CANVAS.topPad);

  // Collision resolution: iterate all pairs, push offending nodes downward.
  const flat: TNode[] = [];
  walk(root, (n) => flat.push(n));

  let detected = 0, resolved = 0;
  let guard = 0;
  let changed = true;
  while (changed && guard < 200) {
    changed = false;
    guard++;
    for (let i = 0; i < flat.length; i++) {
      for (let j = i + 1; j < flat.length; j++) {
        if (boxesOverlap(flat[i], flat[j], CANVAS.minCardGap)) {
          detected++;
          // push the lower-Y one down by (overlap + gap)
          const [lo, hi] = flat[i].y <= flat[j].y ? [flat[i], flat[j]] : [flat[j], flat[i]];
          const delta =
            (lo.y + lo.h / 2) - (hi.y - hi.h / 2) + CANVAS.minCardGap;
          if (delta > 0) {
            hi.y += delta;
            resolved++;
            changed = true;
          }
        }
      }
    }
  }

  // Flatten
  const nodes: TextNode[] = [];
  const debugNodes: NodeDebugInfo[] = [];
  walk(root, (n) => {
    const tnode: TextNode = {
      id: n.id,
      blockId: n.blockId,
      text: n.text,
      shortText: n.shortText,
      type: n.block?.type ?? "detail",
      x: n.x, y: n.y, z: 0, scale: 1, opacity: 1, blur: 0, rotation: 0,
      markerStyle: "none",
      fontWeight: n.kind === "root" || n.kind === "mainIdea" ? 700 : 500,
      variant:
        n.kind === "root" ? "headline"
        : n.kind === "mainIdea" ? "accent"
        : n.kind === "evidence" ? "body"
        : "body",
      width: n.w,
      height: n.h,
      nodeKind: n.kind,
      emphasisWords: [],
      chapterIndex: n.chapterIndex,
      chapterColor: n.chapterColor,
      accentColor: n.chapterColor,
      startTime: n.block?.start,
      endTime: n.block?.end,
      parentId: n.parentId,
      depth: n.depth,
      childIds: n.children.map((c) => c.id),
      cameraTarget: cameraTargetFor(n),
    };
    nodes.push(tnode);
    debugNodes.push({
      id: n.id, kind: n.kind, depth: n.depth, parentId: n.parentId,
      x: n.x, y: n.y, w: n.w, h: n.h,
      childCount: n.children.length, chapterIndex: n.chapterIndex,
    });
  });

  // Chapters (from mainIdea subtrees).
  const chapters: Chapter[] = root.children.map((mainNode, cIdx) => {
    const desc: TNode[] = [];
    walk(mainNode, (d) => desc.push(d));
    const times = desc.map((d) => d.block).filter(Boolean) as TranscriptBlock[];
    const startTime = times.length ? Math.min(...times.map((b) => b.start)) : 0;
    const endTime = times.length ? Math.max(...times.map((b) => b.end)) : 0;
    const startY = Math.min(...desc.map((d) => d.y - d.h / 2));
    const endY = Math.max(...desc.map((d) => d.y + d.h / 2));
    return {
      index: cIdx,
      title: CHAPTER_TITLES[cIdx] ?? `CAPÍTULO ${cIdx + 1}`,
      color: mainNode.chapterColor,
      startTime, endTime, startY, endY,
      blockIds: times.map((b) => b.id),
    };
  });

  const canvasHeight = nodes.reduce(
    (m, n) => Math.max(m, n.y + (n.height ?? 0) / 2),
    0,
  );

  const debug: LayoutDebug = {
    totalNodes: nodes.length,
    totalCollisionsDetected: detected,
    totalCollisionsResolved: resolved,
    chaptersCount: chapters.length,
    canvasHeight,
    nodes: debugNodes,
  };

  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.groupCollapsed(
      `[layout tree] ${nodes.length} nós · ${chapters.length} main ideas · col: ${detected}/${resolved}`,
    );
    // eslint-disable-next-line no-console
    console.table(
      debugNodes.map((d) => ({
        id: d.id, kind: d.kind, depth: d.depth, parent: d.parentId,
        x: Math.round(d.x), y: Math.round(d.y),
        w: d.w, h: d.h, kids: d.childCount, cap: d.chapterIndex,
      })),
    );
    // eslint-disable-next-line no-console
    console.groupEnd();
  }

  return { nodes, chapters, debug };
}

function walk(n: TNode, fn: (n: TNode) => void) {
  fn(n);
  for (const c of n.children) walk(c, fn);
}

function boxesOverlap(a: TNode, b: TNode, pad: number): boolean {
  const ax1 = a.x - a.w / 2, ax2 = a.x + a.w / 2;
  const ay1 = a.y - a.h / 2, ay2 = a.y + a.h / 2;
  const bx1 = b.x - b.w / 2, bx2 = b.x + b.w / 2;
  const by1 = b.y - b.h / 2, by2 = b.y + b.h / 2;
  return !(ax2 + pad < bx1 || bx2 + pad < ax1 || ay2 + pad < by1 || by2 + pad < ay1);
}

/** Backwards-compat. */
export function autoLayout(
  blocks: TranscriptBlock[],
  opts: { seed?: number } = {},
): TextNode[] {
  return autoLayoutFull(blocks, opts).nodes;
}

// ---------- Bounds ----------

export function nodesBounds(nodes: TextNode[]) {
  if (nodes.length === 0) return { minX: -600, minY: -400, maxX: 600, maxY: 400 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const w = n.width ?? 320;
    const h = n.height ?? 100;
    if (n.x - w / 2 < minX) minX = n.x - w / 2;
    if (n.y - h / 2 < minY) minY = n.y - h / 2;
    if (n.x + w / 2 > maxX) maxX = n.x + w / 2;
    if (n.y + h / 2 > maxY) maxY = n.y + h / 2;
  }
  return { minX, minY, maxX, maxY };
}

// ---------- Validation ----------

export interface LayoutValidation {
  ok: boolean;
  overlaps: Array<{ a: string; b: string }>;
  outOfCanvas: string[];
  emptyText: string[];
  invalidTiming: string[];
  totalHeight: number;
  chaptersCount: number;
}

export function validateCanvasLayout(
  nodes: TextNode[],
  chapters: Chapter[] = [],
): LayoutValidation {
  const overlapsArr: Array<{ a: string; b: string }> = [];
  const emptyText: string[] = [];
  const invalidTiming: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n.text?.trim() && !n.shortText?.trim()) emptyText.push(n.id);
    if (n.blockId !== "root") {
      if ((n.startTime ?? 0) < 0 || ((n.endTime ?? 0) < (n.startTime ?? 0)))
        invalidTiming.push(n.id);
    }
    for (let j = i + 1; j < nodes.length; j++) {
      const m = nodes[j];
      const aw = n.width ?? 320, ah = n.height ?? 100;
      const bw = m.width ?? 320, bh = m.height ?? 100;
      const overlap =
        !(n.x + aw / 2 + 8 < m.x - bw / 2 ||
          m.x + bw / 2 + 8 < n.x - aw / 2 ||
          n.y + ah / 2 + 8 < m.y - bh / 2 ||
          m.y + bh / 2 + 8 < n.y - ah / 2);
      if (overlap) overlapsArr.push({ a: n.id, b: m.id });
    }
  }
  const b = nodesBounds(nodes);
  return {
    ok:
      overlapsArr.length === 0 &&
      emptyText.length === 0 &&
      invalidTiming.length === 0,
    overlaps: overlapsArr,
    outOfCanvas: [],
    emptyText,
    invalidTiming,
    totalHeight: b.maxY - b.minY,
    chaptersCount: chapters.length,
  };
}
