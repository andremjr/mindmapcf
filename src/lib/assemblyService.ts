import type { AudioFile, Transcript, TranscriptWord, TranscriptParagraph } from "./types";

export interface TranscribeOptions {
  apiKey: string;
  language: string;
  wordTimestamps: boolean;
  punctuate: boolean;
}

// ---------- Mock fallback (used when no API key) ----------

const SAMPLE_TEXT = [
  "Hoje eu quero te explicar como transformar áudio em vídeo cinematográfico de uma forma nova.",
  "O problema é que a maioria das ferramentas exige edição manual exaustiva e muito tempo.",
  "Mas existe um caminho diferente, baseado em texto, câmera e som sincronizado em um canvas infinito.",
  "Por exemplo, imagine cada ideia da sua fala virando um bloco visual que ganha foco no momento certo.",
  "A solução é tratar a transcrição como um roteiro espacial e deixar a câmera fazer o trabalho pesado.",
  "Atenção: isso não é sobre adicionar efeitos aleatórios, é sobre ritmo, ênfase e respiração.",
  "No entanto, para isso funcionar, os blocos precisam ser curtos, claros e bem classificados.",
  "Resumindo, a ideia central é que o texto vire imagem, e a câmera vire narrativa.",
].join(" ");

function buildMockWords(text: string, totalDuration: number): TranscriptWord[] {
  const tokens = text.split(/\s+/);
  const per = totalDuration / tokens.length;
  return tokens.map((t, i) => {
    const start = i * per;
    const end = start + per * 0.95;
    return {
      id: `w_${i}`,
      text: t,
      start: Number(start.toFixed(2)),
      end: Number(end.toFixed(2)),
      confidence: 0.92 + Math.random() * 0.07,
    };
  });
}

function buildMockParagraphs(words: TranscriptWord[]): TranscriptParagraph[] {
  const paragraphs: TranscriptParagraph[] = [];
  let bucket: TranscriptWord[] = [];
  let idx = 0;
  for (const w of words) {
    bucket.push(w);
    if (/[.!?]$/.test(w.text)) {
      paragraphs.push({
        id: `p_${idx++}`,
        text: bucket.map((x) => x.text).join(" "),
        start: bucket[0].start,
        end: bucket[bucket.length - 1].end,
        wordIds: bucket.map((x) => x.id),
      });
      bucket = [];
    }
  }
  if (bucket.length) {
    paragraphs.push({
      id: `p_${idx}`,
      text: bucket.map((x) => x.text).join(" "),
      start: bucket[0].start,
      end: bucket[bucket.length - 1].end,
      wordIds: bucket.map((x) => x.id),
    });
  }
  return paragraphs;
}

export async function transcribeAudioMock(
  audio: AudioFile,
  opts: TranscribeOptions,
): Promise<Transcript> {
  await new Promise((r) => setTimeout(r, 1200));
  const duration = audio.durationSec || 60;
  const words = buildMockWords(SAMPLE_TEXT, duration);
  return {
    id: `tr_${Date.now()}`,
    language: opts.language,
    durationSec: duration,
    text: SAMPLE_TEXT,
    words,
    paragraphs: buildMockParagraphs(words),
    createdAt: new Date().toISOString(),
  };
}

// ---------- Real AssemblyAI integration ----------
//
// Docs: https://www.assemblyai.com/docs/api-reference/transcripts/submit
// Fluxo:
//   1. POST /v2/upload (raw bytes do áudio) -> { upload_url }
//   2. POST /v2/transcript { audio_url, language_code, punctuate, format_text }
//      -> { id, status }
//   3. GET  /v2/transcript/{id} em polling até status === "completed" | "error"
//
// ⚠️ Esta chamada acontece no navegador e expõe a API key.
// Em produção, mova para uma server function / edge function.

const AAI_BASE = "https://api.assemblyai.com/v2";

// AssemblyAI usa códigos curtos (pt, en, es, fr). Mapear UI -> API.
function mapLanguage(ui: string): string {
  const map: Record<string, string> = {
    "pt-BR": "pt",
    "pt": "pt",
    "en": "en",
    "en-US": "en_us",
    "es": "es",
    "fr": "fr",
  };
  return map[ui] ?? ui;
}

async function fetchBlobFromAudio(audio: AudioFile): Promise<Blob> {
  if (!audio.objectUrl) throw new Error("Áudio sem URL local. Recarregue o arquivo.");
  const res = await fetch(audio.objectUrl);
  if (!res.ok) throw new Error("Não foi possível ler o arquivo de áudio local.");
  return await res.blob();
}

async function uploadAudio(blob: Blob, apiKey: string): Promise<string> {
  const res = await fetch(`${AAI_BASE}/upload`, {
    method: "POST",
    headers: {
      "Authorization": apiKey,
      "Content-Type": "application/octet-stream",
    },
    body: blob,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Upload falhou (${res.status}): ${t || res.statusText}`);
  }
  const data = (await res.json()) as { upload_url: string };
  if (!data.upload_url) throw new Error("Upload sem upload_url na resposta.");
  return data.upload_url;
}

interface AAITranscript {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  error?: string;
  text?: string;
  audio_duration?: number;
  language_code?: string;
  words?: Array<{ text: string; start: number; end: number; confidence: number }>;
}

async function submitTranscript(
  audioUrl: string,
  opts: TranscribeOptions,
): Promise<string> {
  const body: Record<string, unknown> = {
    audio_url: audioUrl,
    language_code: mapLanguage(opts.language),
    punctuate: opts.punctuate,
    format_text: opts.punctuate,
  };
  const res = await fetch(`${AAI_BASE}/transcript`, {
    method: "POST",
    headers: {
      "Authorization": opts.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Criação do transcript falhou (${res.status}): ${t || res.statusText}`);
  }
  const data = (await res.json()) as AAITranscript;
  return data.id;
}

async function pollTranscript(id: string, apiKey: string): Promise<AAITranscript> {
  // Polling a cada 2.5s, timeout em ~5 min.
  const started = Date.now();
  const TIMEOUT = 5 * 60 * 1000;
  while (true) {
    const res = await fetch(`${AAI_BASE}/transcript/${id}`, {
      headers: { "Authorization": apiKey },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Polling falhou (${res.status}): ${t || res.statusText}`);
    }
    const data = (await res.json()) as AAITranscript;
    if (data.status === "completed") return data;
    if (data.status === "error") throw new Error(data.error || "Erro na transcrição.");
    if (Date.now() - started > TIMEOUT) throw new Error("Timeout aguardando transcrição.");
    await new Promise((r) => setTimeout(r, 2500));
  }
}

function normalizeTranscript(t: AAITranscript, fallbackDuration: number): Transcript {
  const aaiWords = t.words ?? [];
  // AssemblyAI retorna start/end em ms — converter para segundos.
  const words: TranscriptWord[] = aaiWords.map((w, i) => ({
    id: `w_${i}`,
    text: w.text,
    start: Number((w.start / 1000).toFixed(3)),
    end: Number((w.end / 1000).toFixed(3)),
    confidence: w.confidence,
  }));
  const paragraphs = buildMockParagraphs(words);
  return {
    id: t.id,
    language: t.language_code ?? "pt",
    durationSec: t.audio_duration ?? fallbackDuration,
    text: t.text ?? words.map((w) => w.text).join(" "),
    words,
    paragraphs,
    createdAt: new Date().toISOString(),
  };
}

export async function transcribeAudioReal(
  audio: AudioFile,
  opts: TranscribeOptions,
): Promise<Transcript> {
  if (!opts.apiKey) throw new Error("API key da AssemblyAI ausente.");
  const blob = await fetchBlobFromAudio(audio);
  const uploadUrl = await uploadAudio(blob, opts.apiKey);
  const id = await submitTranscript(uploadUrl, opts);
  const result = await pollTranscript(id, opts.apiKey);
  return normalizeTranscript(result, audio.durationSec);
}

/**
 * Roteador: usa real se houver API key, senão mock.
 * Mantém compat com o componente que chamava `transcribeAudioMock` direto.
 */
export async function transcribeAudio(
  audio: AudioFile,
  opts: TranscribeOptions,
): Promise<Transcript> {
  if (opts.apiKey && opts.apiKey.trim().length > 0) {
    return transcribeAudioReal(audio, opts);
  }
  return transcribeAudioMock(audio, opts);
}

// --- Persistência segura da API key (apenas sessionStorage) ---
const KEY_STORAGE = "canvas_narrativo.assembly_api_key";

export function loadApiKey(): string {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(KEY_STORAGE) ?? "";
}

export function saveApiKey(key: string) {
  if (typeof window === "undefined") return;
  if (key) window.sessionStorage.setItem(KEY_STORAGE, key);
  else window.sessionStorage.removeItem(KEY_STORAGE);
}
