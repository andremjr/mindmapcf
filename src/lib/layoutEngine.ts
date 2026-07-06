import type {
  TextNode,
  TranscriptBlock,
  MarkerStyle,
  NodeKind,
  Chapter,
  BlockType,
} from "./types";

/**
 * Canvas Narrativo — Layout Engine v2.
 *
 * Distribui blocos narrativos ao longo de um canvas VERTICAL infinito,
 * como um documentário faceless em quadro deslizante. Nunca sobrepõe
 * elementos, agrupa em capítulos coloridos e calcula alvos de câmera.
 */

// ---------- Constantes do canvas ----------

export const CANVAS = {
  /** Largura virtual do canvas. */
  width: 3200,
  /** X da linha guia vertical. */
  guideX: 380,
  /** X central onde os cards são posicionados (centro do card). */
  contentCx: 1360,
  /** Y inicial do primeiro nó (topo do primeiro card). */
  startY: 340,
  /** Padding safe area (horizontal). */
  safePadX: 160,

  // ----- Regras de espaçamento vertical (spec do usuário) -----
  /** Espaçamento vertical mínimo padrão. */
  gapMin: 220,
  /** Espaçamento vertical quando muda de capítulo. */
  gapChapter: 700,
  /** Espaçamento adicional para nós de evidência. */
  gapEvidence: 360,
  /** Espaçamento adicional para nós de gancho (hook). */
  gapHook: 420,
  /** Incremento usado ao resolver colisões (empurra para baixo). */
  collisionStep: 120,
  /** Padding usado no teste de colisão (safe area em torno do card). */
  collisionPad: 40,
} as const;

/** Offsets laterais alternados (dão respiro e leve fluxo visual). */
const X_ALTERNATION = [0, -70, +90, -40, +60, -20];


/** Paleta de cores por capítulo (documentário investigativo moderno). */
const CHAPTER_PALETTE = [
  "#ff4d6d", // vermelho — abertura / tensão
  "#ff9f43", // laranja — investigação / evidência
  "#ffd23f", // amarelo — reflexão / revelação
  "#4facfe", // azul — análise / tecnologia
  "#a78bfa", // roxo — conclusão / meditação
  "#34d399", // verde — resolução
];

/** Palavras que costumam merecer destaque em documentário investigativo. */
const EMPHASIS_LEXICON = new Set(
  [
    "crime", "privacidade", "investigação", "governo", "ia", "vigilância",
    "risco", "dados", "prova", "lei", "empresa", "dinheiro", "milhões",
    "bilhões", "poder", "segredo", "verdade", "mentira", "manipulação",
    "algoritmo", "surveillance", "chatgpt", "openai", "meta", "google",
    "facebook", "documento", "reportagem", "denúncia", "escândalo",
  ].map((w) => w.toLowerCase()),
);

// ---------- Utilidades ----------

interface Box { x: number; y: number; w: number; h: number; }

function bbox(n: TextNode): Box {
  const w = n.width ?? 900;
  const h = n.height ?? 200;
  return { x: n.x - w / 2, y: n.y - h / 2, w, h };
}

function overlaps(a: Box, b: Box, pad = 32): boolean {
  return !(
    a.x + a.w + pad < b.x ||
    b.x + b.w + pad < a.x ||
    a.y + a.h + pad < b.y ||
    b.y + b.h + pad < a.y
  );
}

/** Deriva o tipo visual do card a partir do bloco. */
function pickNodeKind(
  block: TranscriptBlock,
  index: number,
  total: number,
): NodeKind {
  const t = block.type as BlockType;
  if (index === 0) return "hook";
  if (index === total - 1 || t === "conclusion") return "conclusion";
  if (t === "contrast" || /^(mas|só que|porém|no entanto|agora|só|espera|só um detalhe)/i.test(block.text.trim()))
    return "transition";
  if (t === "example" || t === "warning" || /\b(reportagem|documento|estudo|lei|processo|caso|fonte|revelou|denunciou)\b/i.test(block.text))
    return "evidence";
  if (/["“”"'']/.test(block.text) || t === "detail" && block.emphasis > 0.7)
    return "quote";
  if (t === "intro" || (t === "main_idea" && block.emphasis > 0.8))
    return "hook";
  return "statement";
}

/** Dimensões base do card por tipo. */
function cardDimensions(kind: NodeKind, text: string): { width: number; height: number } {
  const widths: Record<NodeKind, number> = {
    hook: 1100,
    statement: 900,
    evidence: 980,
    quote: 820,
    transition: 760,
    conclusion: 1040,
  };
  const width = widths[kind];
  // Estimativa de altura por caracteres/linha.
  const charsPerLine = Math.max(20, Math.floor(width / 22));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const lineH = kind === "hook" ? 88 : kind === "conclusion" ? 74 : kind === "quote" ? 68 : 58;
  const paddingY = kind === "evidence" ? 220 : kind === "hook" || kind === "conclusion" ? 150 : 110;
  const height = lines * lineH + paddingY;
  return { width, height: Math.max(160, height) };
}

/** Zoom-alvo da câmera por tipo. */
function zoomFor(kind: NodeKind): number {
  switch (kind) {
    case "hook": return 0.95;
    case "statement": return 1.0;
    case "evidence": return 0.82;
    case "quote": return 1.08;
    case "transition": return 1.12;
    case "conclusion": return 0.9;
  }
}

/** Detecta palavras a destacar dentro de um texto. Máx 3. */
function extractEmphasisWords(text: string, blockKeywords: string[] = []): string[] {
  const found = new Set<string>();
  for (const kw of blockKeywords) {
    if (kw && kw.length > 2) found.add(kw);
    if (found.size >= 3) break;
  }
  if (found.size < 3) {
    const tokens = text.split(/\s+/);
    for (const raw of tokens) {
      const clean = raw.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      if (clean.length < 3) continue;
      // Palavras do léxico investigativo
      if (EMPHASIS_LEXICON.has(clean)) found.add(raw.replace(/[.,;:!?()"']/g, ""));
      // Números / valores
      else if (/\d/.test(clean) && /(mil|milh|bilh|%|r\$|\$|€|reais|anos?|meses?)/i.test(raw))
        found.add(raw.replace(/[.,;:!?()"']/g, ""));
      // Palavras muito longas em CAPS (siglas, nomes)
      else if (raw.length > 3 && raw === raw.toUpperCase() && /[A-Z]/.test(raw))
        found.add(raw);
      if (found.size >= 3) break;
    }
  }
  return Array.from(found).slice(0, 3);
}

// ---------- Detecção de capítulos ----------

/**
 * Divide blocos em capítulos usando: mudança forte de tipo, pausa temporal
 * grande entre blocos, e um alvo mínimo/máximo de capítulos.
 */
function detectChapters(blocks: TranscriptBlock[]): number[][] {
  if (blocks.length === 0) return [];
  const total = blocks.length;
  // Alvo de nº de capítulos.
  const targetChapters =
    total <= 5 ? Math.max(2, Math.min(3, total))
    : total <= 12 ? 3
    : total <= 20 ? 4
    : total <= 30 ? 5
    : Math.min(10, Math.ceil(total / 6));

  // Score de "quebra" em cada limite (i, i+1).
  const scores: number[] = [];
  for (let i = 0; i < total - 1; i++) {
    const a = blocks[i];
    const b = blocks[i + 1];
    const gap = Math.max(0, b.start - a.end);
    const typeShift = a.type !== b.type ? 1 : 0;
    const strongShift =
      (b.type === "main_idea" || b.type === "contrast" || b.type === "conclusion" || b.type === "problem")
        ? 1.2 : 0;
    scores.push(gap * 1.2 + typeShift * 0.8 + strongShift);
  }

  // Pega os (targetChapters - 1) maiores scores como pontos de quebra,
  // com um espaçamento mínimo para evitar capítulos de 1 bloco.
  const minBlocksPerChapter = Math.max(1, Math.floor(total / (targetChapters * 2)));
  const indexed = scores
    .map((s, i) => ({ i, s }))
    .sort((a, b) => b.s - a.s);
  const cuts = new Set<number>();
  for (const { i } of indexed) {
    if (cuts.size >= targetChapters - 1) break;
    let ok = true;
    for (const c of cuts) {
      if (Math.abs(c - i) < minBlocksPerChapter) { ok = false; break; }
    }
    if (i < minBlocksPerChapter - 1) ok = false;
    if (i > total - 1 - minBlocksPerChapter) ok = false;
    if (ok) cuts.add(i);
  }

  const sortedCuts = Array.from(cuts).sort((a, b) => a - b);
  const groups: number[][] = [];
  let start = 0;
  for (const c of sortedCuts) {
    groups.push(range(start, c + 1));
    start = c + 1;
  }
  groups.push(range(start, total));
  return groups.filter((g) => g.length > 0);
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i < b; i++) out.push(i);
  return out;
}

const CHAPTER_TITLES = [
  "O GANCHO",
  "A HISTÓRIA",
  "AS PROVAS",
  "O PROBLEMA",
  "A ANÁLISE",
  "A REVELAÇÃO",
  "A REFLEXÃO",
  "A CONCLUSÃO",
  "O DESFECHO",
  "O EPÍLOGO",
];

// ---------- Layout principal ----------

interface LayoutOptions {
  seed?: number;
  /** Se true, retorna capítulos junto (via segundo canal — ver `autoLayoutFull`). */
  spread?: number;
}

const MARKER_ROTATION: MarkerStyle[] = ["vline", "dot", "bracket", "dot"];

export interface LayoutResult {
  nodes: TextNode[];
  chapters: Chapter[];
}

/** Retorna nós + capítulos + valida contra sobreposições. */
export function autoLayoutFull(
  blocks: TranscriptBlock[],
  _opts: LayoutOptions = {},
): LayoutResult {
  if (blocks.length === 0) return { nodes: [], chapters: [] };

  const chapterGroups = detectChapters(blocks);
  const chapters: Chapter[] = [];
  const nodes: TextNode[] = [];

  let currentY = CANVAS.startY;
  let previousBoxes: Box[] = [];

  chapterGroups.forEach((group, cIdx) => {
    const color = CHAPTER_PALETTE[cIdx % CHAPTER_PALETTE.length];
    const chapterStartY = currentY;
    const chapterBlocks = group.map((i) => blocks[i]);
    const chapter: Chapter = {
      index: cIdx,
      title: CHAPTER_TITLES[cIdx] ?? `CAPÍTULO ${cIdx + 1}`,
      color,
      startTime: chapterBlocks[0].start,
      endTime: chapterBlocks[chapterBlocks.length - 1].end,
      startY: chapterStartY,
      endY: chapterStartY, // preenchido depois
      blockIds: chapterBlocks.map((b) => b.id),
    };

    group.forEach((blockIdx, iInChapter) => {
      const block = blocks[blockIdx];
      const kind = pickNodeKind(block, blockIdx, blocks.length);
      const { width, height } = cardDimensions(kind, block.shortText || block.text);

      // Alternância lateral suave — cria dinamismo sem quebrar a leitura.
      const parity = blockIdx % 4;
      const offset =
        parity === 0 ? 0
        : parity === 1 ? -CANVAS.alternateOffset * 0.4
        : parity === 2 ? CANVAS.alternateOffset * 0.6
        : -CANVAS.alternateOffset * 0.2;
      const cx = CANVAS.contentCx + offset;

      // Y inicial candidato — mais respiro para hook/evidence/conclusion.
      const kindGap =
        kind === "hook" ? 260
        : kind === "conclusion" ? 260
        : kind === "evidence" ? 220
        : kind === "transition" ? 200
        : kind === "quote" ? 180
        : 160;
      currentY += kindGap;

      let candidate: Box = {
        x: cx - width / 2,
        y: currentY - height / 2,
        w: width,
        h: height,
      };

      // Resolve colisão: empurra para baixo até caber.
      let guard = 0;
      while (previousBoxes.some((p) => overlaps(p, candidate)) && guard < 200) {
        candidate = { ...candidate, y: candidate.y + 40 };
        guard++;
      }

      // Trava dentro do canvas horizontal.
      const halfW = width / 2;
      const minCx = CANVAS.guideX + 140 + halfW;
      const maxCx = CANVAS.width - CANVAS.safePadX - halfW;
      const finalCx = Math.min(Math.max(cx, minCx), maxCx);
      candidate.x = finalCx - width / 2;

      const finalY = candidate.y + height / 2;
      previousBoxes.push(candidate);
      currentY = candidate.y + height; // próximo começa abaixo do card atual

      // Variante tipográfica derivada.
      const variant: TextNode["variant"] =
        kind === "hook" ? "headline"
        : kind === "conclusion" ? "headline"
        : kind === "evidence" ? "body"
        : kind === "transition" ? "caption"
        : kind === "quote" ? "accent"
        : "body";

      const cameraZoom = zoomFor(kind);
      const node: TextNode = {
        id: `n_${block.id}`,
        blockId: block.id,
        text: block.text,
        shortText: block.shortText,
        type: block.type,
        x: finalCx,
        y: finalY,
        z: 0,
        scale: 1,
        opacity: 1,
        blur: 0,
        rotation: 0,
        markerStyle: MARKER_ROTATION[blockIdx % MARKER_ROTATION.length],
        fontWeight: kind === "hook" || kind === "conclusion" ? 700 : 500,
        variant,
        width,
        height,
        nodeKind: kind,
        emphasisWords: extractEmphasisWords(block.text, block.keywords),
        chapterIndex: cIdx,
        chapterColor: color,
        accentColor: color,
        startTime: block.start,
        endTime: block.end,
        cameraTarget: {
          x: finalCx,
          y: finalY,
          zoom: cameraZoom,
        },
      };
      nodes.push(node);
      void iInChapter;
    });

    // Fecha capítulo, adiciona espaçamento para o próximo.
    chapter.endY = currentY;
    chapters.push(chapter);
    currentY += CANVAS.chapterGap;
  });

  // Validação final: se algo colidir (não deveria), empurra iterativamente.
  const validated = enforceNoOverlap(nodes);
  return { nodes: validated, chapters };
}

/** Backwards-compat: mesma assinatura antiga. */
export function autoLayout(
  blocks: TranscriptBlock[],
  opts: LayoutOptions = {},
): TextNode[] {
  return autoLayoutFull(blocks, opts).nodes;
}

/** Força não-sobreposição empurrando nós posteriores para baixo. */
function enforceNoOverlap(nodes: TextNode[]): TextNode[] {
  const out = nodes.map((n) => ({ ...n }));
  for (let i = 0; i < out.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = bbox(out[j]);
      const b = bbox(out[i]);
      if (overlaps(a, b)) {
        const push = (a.y + a.h + 60) - b.y;
        if (push > 0) {
          out[i].y += push;
          if (out[i].cameraTarget) out[i].cameraTarget = { ...out[i].cameraTarget!, y: out[i].y };
        }
      }
    }
  }
  return out;
}

/** Bounding box (para "ver mapa completo" e câmera). */
export function nodesBounds(nodes: TextNode[]) {
  if (nodes.length === 0) return { minX: -600, minY: -400, maxX: 600, maxY: 400 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const w = n.width ?? 400;
    const h = n.height ?? 200;
    if (n.x - w / 2 < minX) minX = n.x - w / 2;
    if (n.y - h / 2 < minY) minY = n.y - h / 2;
    if (n.x + w / 2 > maxX) maxX = n.x + w / 2;
    if (n.y + h / 2 > maxY) maxY = n.y + h / 2;
  }
  return { minX, minY, maxX, maxY };
}

// ---------- Validação pública ----------

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
  const outOfCanvas: string[] = [];
  const emptyText: string[] = [];
  const invalidTiming: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n.text?.trim() && !n.shortText?.trim()) emptyText.push(n.id);
    if ((n.startTime ?? 0) < 0 || ((n.endTime ?? 0) < (n.startTime ?? 0)))
      invalidTiming.push(n.id);
    const w = n.width ?? 400;
    if (n.x - w / 2 < 0 || n.x + w / 2 > CANVAS.width) outOfCanvas.push(n.id);
    for (let j = i + 1; j < nodes.length; j++) {
      if (overlaps(bbox(n), bbox(nodes[j]), 8)) {
        overlapsArr.push({ a: n.id, b: nodes[j].id });
      }
    }
  }
  const b = nodesBounds(nodes);
  return {
    ok:
      overlapsArr.length === 0 &&
      outOfCanvas.length === 0 &&
      emptyText.length === 0 &&
      invalidTiming.length === 0,
    overlaps: overlapsArr,
    outOfCanvas,
    emptyText,
    invalidTiming,
    totalHeight: b.maxY - b.minY,
    chaptersCount: chapters.length,
  };
}
