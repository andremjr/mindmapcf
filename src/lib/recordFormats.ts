// Recording frame formats. The presentation "frame" is rendered at this
// aspect ratio and the Region Capture API crops the tab video track to
// exactly this rectangle, so nothing outside the frame appears in the file.

export interface RecordFormat {
  id: string;
  label: string;
  width: number;
  height: number;
  hint?: string;
}

export const RECORD_FORMATS: RecordFormat[] = [
  { id: "1080p", label: "1920 × 1080 (YouTube 16:9)", width: 1920, height: 1080, hint: "Padrão YouTube horizontal" },
  { id: "720p", label: "1280 × 720 (16:9 leve)", width: 1280, height: 720, hint: "Menor tamanho de arquivo" },
  { id: "vertical", label: "1080 × 1920 (Shorts / Reels 9:16)", width: 1080, height: 1920, hint: "Vertical" },
  { id: "square", label: "1080 × 1080 (Quadrado 1:1)", width: 1080, height: 1080, hint: "Feed" },
];

const KEY = "cn:record-format:";

export function saveRecordFormat(projectId: string, fmt: RecordFormat) {
  try {
    sessionStorage.setItem(KEY + projectId, JSON.stringify(fmt));
  } catch {
    /* ignore */
  }
}

export function loadRecordFormat(projectId: string): RecordFormat | null {
  try {
    const raw = sessionStorage.getItem(KEY + projectId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecordFormat;
    if (!parsed?.width || !parsed?.height) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function defaultRecordFormat(): RecordFormat {
  return RECORD_FORMATS[0];
}
