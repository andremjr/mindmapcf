// Screen + mic recorder for presentation mode.
// Uses getDisplayMedia (tab/screen + system audio) mixed with getUserMedia (mic).
// Produces a Blob (webm on Chromium, mp4 on Safari when supported).

export type RecorderState = "idle" | "armed" | "recording" | "stopping" | "done";

export interface RecordingResult {
  blob: Blob;
  url: string;
  mimeType: string;
  durationMs: number;
  filename: string;
}

interface ActiveRecording {
  recorder: MediaRecorder;
  chunks: Blob[];
  mixed: MediaStream;
  displayStream: MediaStream;
  micStream: MediaStream | null;
  audioCtx: AudioContext | null;
  audioAnalyser: AnalyserNode | null;
  hasMic: boolean;
  cropApplied: boolean;
  mimeType: string;
  startedAt: number;
  filenameBase: string;
  onStateChange?: (s: RecorderState) => void;
  stopPromise: Promise<RecordingResult>;
  resolveStop: (r: RecordingResult) => void;
  rejectStop: (e: unknown) => void;
}

let active: ActiveRecording | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}


export function subscribeRecorder(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getRecorderState(): {
  state: RecorderState;
  startedAt: number | null;
  mimeType: string | null;
} {
  if (!active) return { state: "idle", startedAt: null, mimeType: null };
  const rs = active.recorder.state;
  const state: RecorderState =
    rs === "inactive" ? "armed" : rs === "recording" ? "recording" : "stopping";
  return {
    state,
    startedAt: state === "armed" ? null : active.startedAt,
    mimeType: active.mimeType,
  };
}

/** AnalyserNode for the mic (or display audio if no mic). Null when idle. */
export function getRecordingAnalyser(): AnalyserNode | null {
  return active?.audioAnalyser ?? null;
}

export function getRecordingHasMic(): boolean {
  return !!active?.hasMic;
}


function pickMimeType(): string {
  // Ordered by preference: highest-quality VP9 first (YouTube-friendly),
  // then AV1 if available, then fallbacks. MP4 goes last — WebM VP9 gives
  // better visual fidelity for screen content and YouTube accepts it natively.
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=av01,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4;codecs=avc1,mp4a", // Safari fallback only
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "video/webm";
}

export interface StartOptions {
  filenameBase?: string;
  videoBitsPerSecond?: number;
  audioBitsPerSecond?: number;
  frameRate?: number;
  /** If true, sets up the pipeline but doesn't start the MediaRecorder yet.
   * Caller must invoke `beginArmedRecording()` to actually start capture. */
  armed?: boolean;
}

/**
 * Start a screen + mic recording. Must be called from a user gesture.
 * Throws on permission denial. On success, `stopRecording()` yields the Blob.
 *
 * On Chromium the picker is biased toward the current tab via
 * `preferCurrentTab: true`, so the user only has to confirm — no "entire
 * screen / window / tab" choice — and the recording is scoped to this tab
 * only.
 */
export async function startRecording(opts: StartOptions = {}): Promise<void> {
  if (active) throw new Error("Já existe uma gravação em andamento.");
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    throw new Error("Este navegador não suporta gravação de tela.");
  }
  if (!("getDisplayMedia" in navigator.mediaDevices)) {
    throw new Error("Seu navegador não permite captura de tela (tente Chrome/Edge no desktop).");
  }

  const displayMediaOpts: any = {
    video: {
      frameRate: opts.frameRate ?? 60,
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: true,
    // Chromium-only: pre-select the current tab so the user doesn't get the
    // "entire screen / window / tab" menu. Ignored elsewhere.
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
    systemAudio: "include",
  };

  const displayStream: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia(
    displayMediaOpts,
  );

  const selectedVideoTrack = displayStream.getVideoTracks()[0] as MediaStreamTrack & {
    cropTo?: (target: unknown) => Promise<void>;
    getSettings?: () => MediaTrackSettings & { displaySurface?: string };
  };
  const CropTargetCtor = (globalThis as any).CropTarget as
    | { fromElement: (el: Element) => Promise<unknown> }
    | undefined;
  const displaySurface = selectedVideoTrack?.getSettings?.().displaySurface;
  if (!selectedVideoTrack || !CropTargetCtor || typeof selectedVideoTrack.cropTo !== "function") {
    for (const t of displayStream.getTracks()) t.stop();
    throw new Error(
      "Para gravar só o quadro, use Chrome ou Edge no desktop e selecione a guia atual.",
    );
  }
  if (displaySurface && displaySurface !== "browser") {
    for (const t of displayStream.getTracks()) t.stop();
    throw new Error(
      "Selecione a guia atual do Canvas Narrativo na janela de compartilhamento. Janela/tela inteira não pode ser recortada com segurança.",
    );
  }



  let micStream: MediaStream | null = null;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) {
    // Mic denied → continue with system audio only.
    console.warn("[screenRecorder] mic denied", e);
  }

  // Build a mixed stream: display video + mixed audio (system + mic).
  const mixed = new MediaStream();
  for (const track of displayStream.getVideoTracks()) mixed.addTrack(track);

  let audioCtx: AudioContext | null = null;
  let audioAnalyser: AnalyserNode | null = null;
  const hasDisplayAudio = displayStream.getAudioTracks().length > 0;
  const hasMic = !!micStream && micStream.getAudioTracks().length > 0;
  if (hasDisplayAudio || hasMic) {
    audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    audioAnalyser = audioCtx.createAnalyser();
    audioAnalyser.fftSize = 1024;
    audioAnalyser.smoothingTimeConstant = 0.6;
    if (hasDisplayAudio) {
      const src = audioCtx.createMediaStreamSource(
        new MediaStream(displayStream.getAudioTracks()),
      );
      src.connect(dest);
      // Only route display audio to the meter when there's no mic — otherwise
      // the meter tracks the presenter's voice (what the user actually cares
      // about verifying while recording).
      if (!hasMic) src.connect(audioAnalyser);
    }
    if (hasMic && micStream) {
      const src = audioCtx.createMediaStreamSource(micStream);
      src.connect(dest);
      src.connect(audioAnalyser);
    }
    for (const t of dest.stream.getAudioTracks()) mixed.addTrack(t);
  }


  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(mixed, {
    mimeType,
    // ~16 Mbps at 1080p60 → visually lossless for screen recordings, well
    // within YouTube's ingest recommendation for 1080p60 (12 Mbps).
    videoBitsPerSecond: opts.videoBitsPerSecond ?? 16_000_000,
    audioBitsPerSecond: opts.audioBitsPerSecond ?? 192_000,
  });
  const chunks: Blob[] = [];

  let resolveStop!: (r: RecordingResult) => void;
  let rejectStop!: (e: unknown) => void;
  const stopPromise = new Promise<RecordingResult>((res, rej) => {
    resolveStop = res;
    rejectStop = rej;
  });

  recorder.addEventListener("dataavailable", (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  });
  recorder.addEventListener("stop", () => {
    if (!active) return;
    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `${active.filenameBase}-${stamp}.${ext}`;
    const durationMs = performance.now() - active.startedAt;
    // Teardown streams
    for (const t of mixed.getTracks()) t.stop();
    for (const t of displayStream.getTracks()) t.stop();
    if (micStream) for (const t of micStream.getTracks()) t.stop();
    if (audioCtx) audioCtx.close().catch(() => {});
    resolveStop({ blob, url, mimeType, durationMs, filename });
    active = null;
    emit();
  });
  recorder.addEventListener("error", (ev) => {
    rejectStop((ev as any).error ?? new Error("Falha na gravação"));
    active = null;
    emit();
  });

  // If the user hits "Stop sharing" in the browser UI, end the recording gracefully.
  const videoTrack = displayStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.addEventListener("ended", () => {
      if (active && active.recorder.state === "recording") {
        try {
          active.recorder.stop();
        } catch {
          /* ignore */
        }
      }
    });
  }

  active = {
    recorder,
    chunks,
    mixed,
    displayStream,
    micStream,
    audioCtx,
    audioAnalyser,
    hasMic,
    cropApplied: false,
    mimeType,
    startedAt: performance.now(),
    filenameBase: opts.filenameBase || "apresentacao",
    stopPromise,
    resolveStop,
    rejectStop,
  };

  if (!opts.armed) {
    recorder.start(1000); // 1s chunks → memory-friendly for long recordings
  }
  emit();
}

/** Start capture on a recorder previously created with `{ armed: true }`. */
export function beginArmedRecording(): void {
  if (!active) throw new Error("Nenhuma gravação armada.");
  if (active.recorder.state !== "inactive") return;
  active.startedAt = performance.now();
  active.recorder.start(1000);
  emit();
}

/** Stop the active recording and resolve with the final Blob + object URL. */
export async function stopRecording(): Promise<RecordingResult> {
  if (!active) throw new Error("Nenhuma gravação em andamento.");
  const current = active;
  if (current.recorder.state === "recording") {
    current.recorder.stop();
  }
  emit();
  return current.stopPromise;
}

/** Abort the current recording without producing a download. */
export async function cancelRecording(): Promise<void> {
  if (!active) return;
  const cur = active;
  try {
    if (cur.recorder.state === "recording") cur.recorder.stop();
  } catch {
    /* ignore */
  }
  // Ensure teardown even if `stop` never fires (defensive).
  try {
    for (const t of cur.mixed.getTracks()) t.stop();
    for (const t of cur.displayStream.getTracks()) t.stop();
    if (cur.micStream) for (const t of cur.micStream.getTracks()) t.stop();
    if (cur.audioCtx) cur.audioCtx.close().catch(() => {});
  } catch {
    /* ignore */
  }
  active = null;
  emit();
}

export function isRecording(): boolean {
  return !!active && active.recorder.state === "recording";
}

/**
 * Region Capture: crop the tab video track to an on-page element so only
 * the mind-map frame ends up in the recording. Chrome/Edge only; returns
 * `false` when the API isn't available (Safari/Firefox), so the caller can
 * fall back to whole-tab capture.
 */
export async function cropRecordingToElement(el: Element): Promise<boolean> {
  if (!active) return false;
  const track = active.displayStream.getVideoTracks()[0] as unknown as {
    cropTo?: (target: unknown) => Promise<void>;
  };
  const CropTargetCtor = (globalThis as any).CropTarget as
    | { fromElement: (el: Element) => Promise<unknown> }
    | undefined;
  if (!CropTargetCtor || typeof track?.cropTo !== "function") return false;
  try {
    const target = await CropTargetCtor.fromElement(el);
    await track.cropTo(target);
    active.cropApplied = true;
    return true;
  } catch (e) {
    console.warn("[screenRecorder] cropTo failed", e);
    return false;
  }
}
