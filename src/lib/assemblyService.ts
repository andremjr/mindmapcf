import type { AudioFile, Transcript, TranscriptWord, TranscriptParagraph } from "./types";

export interface TranscribeOptions {
  apiKey: string;
  language: string;
  wordTimestamps: boolean;
  punctuate: boolean;
}

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
  // Quebra em parágrafos a cada pontuação forte.
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
  // Simula latência da API.
  await new Promise((r) => setTimeout(r, 1400));
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

/**
 * Integração real com AssemblyAI.
 *
 * ⚠️ Não chamar do frontend em produção: a chave ficaria exposta.
 * Esta função deve ser movida para uma edge function / server function
 * (TanStack `createServerFn`) que recebe o áudio (ou URL assinada) e
 * a opção de idioma, e devolve o transcript normalizado.
 *
 * Fluxo esperado:
 *  1. POST https://api.assemblyai.com/v2/upload (binário do áudio)
 *  2. POST https://api.assemblyai.com/v2/transcript com upload_url + language_code + punctuate + format_text
 *  3. Polling em GET /v2/transcript/{id} até status === "completed"
 *  4. Normalizar words[] e utterances[] para o formato `Transcript`.
 */
export async function transcribeAudioReal(
  _audio: AudioFile,
  _opts: TranscribeOptions,
): Promise<Transcript> {
  throw new Error(
    "transcribeAudioReal não implementado no MVP. Conecte via edge function antes de usar em produção.",
  );
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
