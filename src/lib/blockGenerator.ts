import type {
  Transcript,
  TranscriptBlock,
  TranscriptWord,
  BlockType,
} from "./types";
import { TRIGGERS, STOPWORDS_PT } from "./triggers";

const MAX_CHARS = 120;
const MIN_DUR = 5;
const MAX_DUR = 12;
const PAUSE_THRESHOLD = 0.6;
const STRONG_PUNCT = /[.!?]$/;

function uid(prefix = "blk") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Segmenta palavras em grupos respeitando pausa, pontuação e limites. */
function segmentWords(words: TranscriptWord[]): TranscriptWord[][] {
  const groups: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];

  const flush = () => {
    if (current.length > 0) {
      groups.push(current);
      current = [];
    }
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    current.push(w);

    const next = words[i + 1];
    const groupStart = current[0].start;
    const groupEnd = w.end;
    const groupDur = groupEnd - groupStart;
    const groupChars = current.map((x) => x.text).join(" ").length;
    const pauseAhead = next ? next.start - w.end : 0;
    const endsStrong = STRONG_PUNCT.test(w.text);

    const tooBig = groupDur >= MAX_DUR || groupChars >= MAX_CHARS;
    const niceBreak =
      groupDur >= MIN_DUR &&
      (endsStrong || pauseAhead >= PAUSE_THRESHOLD);

    if (tooBig || niceBreak) flush();
  }
  flush();

  // Junta micro-grupos com o anterior.
  const merged: TranscriptWord[][] = [];
  for (const g of groups) {
    const dur = g[g.length - 1].end - g[0].start;
    if (merged.length > 0 && dur < 2) {
      merged[merged.length - 1].push(...g);
    } else {
      merged.push(g);
    }
  }
  return merged;
}

export function classifyBlock(
  text: string,
  index: number,
  total: number,
): BlockType {
  const lower = ` ${text.toLowerCase()} `;
  for (const [type, words] of Object.entries(TRIGGERS)) {
    if (words.some((w) => lower.includes(` ${w} `) || lower.includes(`${w} `))) {
      return type as BlockType;
    }
  }
  if (index === 0) return "intro";
  if (index === total - 1) return "conclusion";
  return index % 3 === 0 ? "main_idea" : "detail";
}

export function generateShortText(text: string): string {
  const cleaned = text
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const kept = cleaned.filter((w) => !STOPWORDS_PT.has(w.toLowerCase()));
  const pick = kept.length >= 4 ? kept : cleaned;
  return pick.slice(0, 8).join(" ");
}

export function extractKeywords(text: string, n = 5): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOPWORDS_PT.has(t));
  const freq = new Map<string, number>();
  tokens.forEach((t) => freq.set(t, (freq.get(t) ?? 0) + 1));
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

function computeEmphasis(text: string, type: BlockType): number {
  let e = 0.3;
  if (/[!?]/.test(text)) e += 0.25;
  if (/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}/.test(text)) e += 0.2;
  if (["warning", "problem", "conclusion", "intro"].includes(type)) e += 0.2;
  return Math.min(1, e);
}

export function generateBlocks(transcript: Transcript): TranscriptBlock[] {
  const groups = segmentWords(transcript.words);
  return groups.map((g, i) => {
    const text = g.map((w) => w.text).join(" ").replace(/\s+([,.!?;:])/g, "$1");
    const start = g[0].start;
    const end = g[g.length - 1].end;
    const type = classifyBlock(text, i, groups.length);
    return {
      id: uid(),
      text,
      shortText: generateShortText(text),
      start,
      end,
      duration: end - start,
      type,
      emphasis: computeEmphasis(text, type),
      keywords: extractKeywords(text),
      originalWordIds: g.map((w) => w.id),
    };
  });
}

export function mergeBlocks(a: TranscriptBlock, b: TranscriptBlock): TranscriptBlock {
  const text = `${a.text} ${b.text}`;
  return {
    ...a,
    text,
    shortText: generateShortText(text),
    end: b.end,
    duration: b.end - a.start,
    keywords: extractKeywords(text),
    originalWordIds: [...a.originalWordIds, ...b.originalWordIds],
  };
}

export function splitBlock(b: TranscriptBlock, atChar: number): [TranscriptBlock, TranscriptBlock] {
  const safe = Math.max(1, Math.min(b.text.length - 1, atChar));
  const t1 = b.text.slice(0, safe).trim();
  const t2 = b.text.slice(safe).trim();
  const ratio = safe / b.text.length;
  const mid = b.start + b.duration * ratio;
  return [
    {
      ...b,
      id: uid(),
      text: t1,
      shortText: generateShortText(t1),
      end: mid,
      duration: mid - b.start,
      keywords: extractKeywords(t1),
    },
    {
      ...b,
      id: uid(),
      text: t2,
      shortText: generateShortText(t2),
      start: mid,
      duration: b.end - mid,
      keywords: extractKeywords(t2),
    },
  ];
}
