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

/**
 * ETAPA 1 — Medição do nó.
 *
 * Estima largura/altura com base em: nº de caracteres, nº de palavras, tipo,
 * tamanho da fonte, padding e largura máxima. Determinístico.
 */
export function measureNode(
  kind: NodeKind,
  text: string,
): { width: number; height: number; fontSize: number; padding: number; lines: number } {
  // Largura por tipo (max width). Cards grandes e legíveis.
  const widths: Record<NodeKind, number> = {
    hook: 1180,
    statement: 980,
    evidence: 1060,
    quote: 900,
    transition: 820,
    conclusion: 1120,
  };
  // Font-size do corpo por tipo.
  const fontSizes: Record<NodeKind, number> = {
    hook: 54,
    statement: 40,
    evidence: 38,
    quote: 44,
    transition: 32,
    conclusion: 50,
  };
  // Padding interno vertical (soma topo+base).
  const paddings: Record<NodeKind, number> = {
    hook: 180,
    statement: 140,
    evidence: 240, // header de "documento" ocupa mais
    quote: 200,   // aspas grandes
    transition: 130,
    conclusion: 180,
  };

  const width = widths[kind];
  const fontSize = fontSizes[kind];
  const padding = paddings[kind];

  const clean = (text ?? "").trim();
  const charCount = clean.length;
  const wordCount = clean.split(/\s+/).filter(Boolean).length;

  // Largura útil interna (descontando padding horizontal ~ 96 px total).
  const innerWidth = width - 96;
  // Caracteres por linha proporcional à fonte (regra empírica ~ 0.55 * fontSize/char).
  const avgCharW = fontSize * 0.55;
  const charsPerLine = Math.max(12, Math.floor(innerWidth / avgCharW));

  // Estimativa por caracteres...
  const linesByChars = Math.ceil(charCount / charsPerLine);
  // ...e por palavras (evita subestimar quando há muitas palavras curtas).
  const wordsPerLine = Math.max(3, Math.floor(charsPerLine / 5.2));
  const linesByWords = Math.ceil(wordCount / wordsPerLine);
  const lines = Math.max(1, linesByChars, linesByWords);

  const lineHeight = Math.round(fontSize * 1.32);
  const height = Math.max(180, lines * lineHeight + padding);

  return { width, height, fontSize, padding, lines };
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

/** Gap vertical acima do nó atual, conforme spec. */
function gapAbove(kind: NodeKind, isChapterStart: boolean): number {
  if (isChapterStart) return CANVAS.gapChapter;
  if (kind === "hook") return CANVAS.gapHook;
  if (kind === "evidence") return CANVAS.gapEvidence;
  return CANVAS.gapMin;
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

export interface NodeDebugInfo {
  id: string;
  blockId: string;
  kind: NodeKind;
  chapterIndex: number;
  isChapterStart: boolean;
  gapApplied: number;
  targetY: number;
  finalY: number;
  x: number;
  width: number;
  height: number;
  chars: number;
  words: number;
  lines: number;
  collisionsDetected: number;
  collisionsResolved: number;
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

/**
 * Layout determinístico em duas etapas.
 *
 * ETAPA 1 — mede todos os nós (largura/altura estimadas por chars, palavras,
 * tipo, fonte, padding e maxWidth).
 * ETAPA 2 — posiciona sequencialmente com a fórmula
 *   nextY = prev.y + prev.height + gap
 * onde `gap` respeita: mudança de capítulo (700), hook (420), evidence (360)
 * ou mínimo (220). Depois roda resolução de colisão empurrando em passos de
 * 120 px até não haver sobreposição.
 */
export function autoLayoutFull(
  blocks: TranscriptBlock[],
  _opts: LayoutOptions = {},
): LayoutResult {
  if (blocks.length === 0) {
    return {
      nodes: [],
      chapters: [],
      debug: {
        totalNodes: 0, totalCollisionsDetected: 0, totalCollisionsResolved: 0,
        chaptersCount: 0, canvasHeight: 0, nodes: [],
      },
    };
  }

  const chapterGroups = detectChapters(blocks);

  // Mapa blockIdx -> chapterIndex, para saber se é início de capítulo.
  const chapterOf = new Map<number, number>();
  const chapterFirstBlock = new Map<number, number>();
  chapterGroups.forEach((group, cIdx) => {
    group.forEach((bIdx, i) => {
      chapterOf.set(bIdx, cIdx);
      if (i === 0) chapterFirstBlock.set(cIdx, bIdx);
    });
  });

  // ---------- ETAPA 1 · Medição ----------
  type Measured = {
    block: TranscriptBlock;
    blockIdx: number;
    kind: NodeKind;
    width: number;
    height: number;
    chars: number;
    words: number;
    lines: number;
    chapterIndex: number;
    isChapterStart: boolean;
  };
  const measured: Measured[] = blocks.map((block, idx) => {
    const kind = pickNodeKind(block, idx, blocks.length);
    const text = block.shortText || block.text || "";
    const m = measureNode(kind, text);
    return {
      block,
      blockIdx: idx,
      kind,
      width: m.width,
      height: m.height,
      chars: text.length,
      words: text.split(/\s+/).filter(Boolean).length,
      lines: m.lines,
      chapterIndex: chapterOf.get(idx) ?? 0,
      isChapterStart: chapterFirstBlock.get(chapterOf.get(idx) ?? 0) === idx,
    };
  });

  // ---------- ETAPA 2 · Posicionamento sequencial ----------
  const nodes: TextNode[] = [];
  const boxes: Box[] = []; // em coords TOP-LEFT
  const debugNodes: NodeDebugInfo[] = [];
  let totalCollisionsDetected = 0;
  let totalCollisionsResolved = 0;

  // "cursor" mantém a posição do TOPO do próximo card.
  // Para o primeiro: topo = CANVAS.startY (nada acima).
  let prevBottom = CANVAS.startY; // "bottom" virtual do nó anterior
  let firstPlaced = false;

  for (const m of measured) {
    const gap = firstPlaced ? gapAbove(m.kind, m.isChapterStart) : 0;
    const targetTop = firstPlaced ? prevBottom + gap : CANVAS.startY;

    // Alternância lateral leve — fluxo, sem quebrar leitura.
    const offset = X_ALTERNATION[m.blockIdx % X_ALTERNATION.length];
    let cx = CANVAS.contentCx + offset;
    const halfW = m.width / 2;
    const minCx = CANVAS.guideX + 140 + halfW;
    const maxCx = CANVAS.width - CANVAS.safePadX - halfW;
    cx = Math.min(Math.max(cx, minCx), maxCx);

    let top = targetTop;
    let candidate: Box = { x: cx - halfW, y: top, w: m.width, h: m.height };

    // Resolução de colisão — empurra em passos de 120 px.
    let localDetected = 0;
    let localResolved = 0;
    let guard = 0;
    while (
      boxes.some((p) => overlaps(p, candidate, CANVAS.collisionPad)) &&
      guard < 300
    ) {
      localDetected++;
      top += CANVAS.collisionStep;
      candidate = { ...candidate, y: top };
      guard++;
      // Se a próxima iteração já não colide, contamos como resolvido.
      if (!boxes.some((p) => overlaps(p, candidate, CANVAS.collisionPad))) {
        localResolved++;
      }
    }
    totalCollisionsDetected += localDetected;
    totalCollisionsResolved += localResolved;

    boxes.push(candidate);
    const finalCy = top + m.height / 2;
    prevBottom = top + m.height;
    firstPlaced = true;

    const variant: TextNode["variant"] =
      m.kind === "hook" ? "headline"
      : m.kind === "conclusion" ? "headline"
      : m.kind === "evidence" ? "body"
      : m.kind === "transition" ? "caption"
      : m.kind === "quote" ? "accent"
      : "body";

    const color = CHAPTER_PALETTE[m.chapterIndex % CHAPTER_PALETTE.length];
    const node: TextNode = {
      id: `n_${m.block.id}`,
      blockId: m.block.id,
      text: m.block.text,
      shortText: m.block.shortText,
      type: m.block.type,
      x: cx,
      y: finalCy,
      z: 0,
      scale: 1,
      opacity: 1,
      blur: 0,
      rotation: 0,
      markerStyle: MARKER_ROTATION[m.blockIdx % MARKER_ROTATION.length],
      fontWeight: m.kind === "hook" || m.kind === "conclusion" ? 700 : 500,
      variant,
      width: m.width,
      height: m.height,
      nodeKind: m.kind,
      emphasisWords: extractEmphasisWords(m.block.text, m.block.keywords),
      chapterIndex: m.chapterIndex,
      chapterColor: color,
      accentColor: color,
      startTime: m.block.start,
      endTime: m.block.end,
      cameraTarget: { x: cx, y: finalCy, zoom: zoomFor(m.kind) },
    };
    nodes.push(node);
    debugNodes.push({
      id: node.id,
      blockId: m.block.id,
      kind: m.kind,
      chapterIndex: m.chapterIndex,
      isChapterStart: m.isChapterStart,
      gapApplied: gap,
      targetY: targetTop,
      finalY: top,
      x: cx,
      width: m.width,
      height: m.height,
      chars: m.chars,
      words: m.words,
      lines: m.lines,
      collisionsDetected: localDetected,
      collisionsResolved: localResolved,
    });
  }

  // Capítulos derivados dos nós já posicionados.
  const chapters: Chapter[] = chapterGroups.map((group, cIdx) => {
    const chapterNodes = nodes.filter((n) => n.chapterIndex === cIdx);
    const firstBlock = blocks[group[0]];
    const lastBlock = blocks[group[group.length - 1]];
    const startY = chapterNodes.length
      ? Math.min(...chapterNodes.map((n) => n.y - (n.height ?? 0) / 2))
      : 0;
    const endY = chapterNodes.length
      ? Math.max(...chapterNodes.map((n) => n.y + (n.height ?? 0) / 2))
      : 0;
    return {
      index: cIdx,
      title: CHAPTER_TITLES[cIdx] ?? `CAPÍTULO ${cIdx + 1}`,
      color: CHAPTER_PALETTE[cIdx % CHAPTER_PALETTE.length],
      startTime: firstBlock.start,
      endTime: lastBlock.end,
      startY,
      endY,
      blockIds: group.map((i) => blocks[i].id),
    };
  });

  // Validação final: garante zero colisões (empurra o que sobrar).
  const validated = enforceNoOverlap(nodes);

  // Debug + log.
  const canvasHeight = validated.reduce(
    (max, n) => Math.max(max, n.y + (n.height ?? 0) / 2),
    0,
  );
  const debug: LayoutDebug = {
    totalNodes: validated.length,
    totalCollisionsDetected,
    totalCollisionsResolved,
    chaptersCount: chapters.length,
    canvasHeight,
    nodes: debugNodes,
  };
  if (typeof console !== "undefined") {
    // Painel de debug via console — visível no dev tools.
    // eslint-disable-next-line no-console
    console.groupCollapsed(
      `[layout] ${validated.length} nós · ${chapters.length} caps · colisões: ${totalCollisionsDetected} detectadas / ${totalCollisionsResolved} resolvidas`,
    );
    // eslint-disable-next-line no-console
    console.table(
      debugNodes.map((d) => ({
        id: d.id,
        kind: d.kind,
        cap: d.chapterIndex,
        x: Math.round(d.x),
        y: Math.round(d.finalY),
        w: d.width,
        h: d.height,
        lines: d.lines,
        gap: d.gapApplied,
        col: `${d.collisionsDetected}/${d.collisionsResolved}`,
      })),
    );
    // eslint-disable-next-line no-console
    console.groupEnd();
  }

  return { nodes: validated, chapters, debug };
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
