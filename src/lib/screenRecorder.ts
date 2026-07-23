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
  hasNarration: boolean;
  narrationEl: HTMLAudioElement | null;
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

export function getRecordingHasNarration(): boolean {
  return !!active?.hasNarration;
}

export function getRecordingNarrationEl(): HTMLAudioElement | null {
  return active?.narrationEl ?? null;
}


function pickMimeType(): string {
  // H.264 primeiro: no Chrome/Edge desktop o encoder é acelerado por hardware
  // (GPU), então libera a CPU para a decodificação do <video> do nó tocar
  // liso mesmo em velocidades aceleradas. VP9/AV1 ficam como fallback — são
  // codificados em software (libvpx) e saturam a CPU em máquinas medianas.
  const candidates = [
    "video/mp4;codecs=avc1,mp4a",
    "video/webm;codecs=h264,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=av01,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
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
  /** Target capture resolution. Bumps getDisplayMedia constraints so 4K is
   * actually available when the user picks it. Defaults to 1920x1080. */
  targetWidth?: number;
  targetHeight?: number;
  /** If true, sets up the pipeline but doesn't start the MediaRecorder yet.
   * Caller must invoke `beginArmedRecording()` to actually start capture. */
  armed?: boolean;
  /**
   * Optional pre-recorded narration. When provided, the microphone is NOT
   * captured — the narration becomes the audio track of the recording.
   * The caller keeps ownership of the element and controls play/pause.
   */
  narrationEl?: HTMLAudioElement;
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

  const targetW = opts.targetWidth ?? 1920;
  const targetH = opts.targetHeight ?? 1080;
  const displayMediaOpts: any = {
    video: {
      // 30fps is plenty for a mind-map presentation and keeps the encoder
      // well under the CPU ceiling on mid-range machines. At 60fps the
      // encoder often can't keep up when a node video is decoding at the
      // same time — dropped frames show up as visual corruption in the
      // final file and cause the on-screen video to stutter.
      frameRate: opts.frameRate ?? 30,
      width: { ideal: targetW },
      height: { ideal: targetH },
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



  const narrationEl = opts.narrationEl ?? null;
  const hasNarration = !!narrationEl;

  // When narration is provided, skip the mic entirely — the narration IS the
  // recording's audio track. The user operates the map in sync with playback.
  let micStream: MediaStream | null = null;
  if (!hasNarration) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
      // Mic denied → continue with system audio only.
      console.warn("[screenRecorder] mic denied", e);
    }
  }

  // Build a mixed stream: display video + mixed audio (system + mic + narration).
  const mixed = new MediaStream();
  for (const track of displayStream.getVideoTracks()) mixed.addTrack(track);

  let audioCtx: AudioContext | null = null;
  let audioAnalyser: AnalyserNode | null = null;
  const hasDisplayAudio = displayStream.getAudioTracks().length > 0;
  const hasMic = !!micStream && micStream.getAudioTracks().length > 0;
  if (hasDisplayAudio || hasMic || hasNarration) {
    audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    audioAnalyser = audioCtx.createAnalyser();
    audioAnalyser.fftSize = 1024;
    audioAnalyser.smoothingTimeConstant = 0.6;
    // With narration active we don't wire the tab audio in — narration is the
    // whole soundtrack, and mixing tab audio in would double any music the
    // narration file already contains.
    if (hasDisplayAudio && !hasNarration) {
      const src = audioCtx.createMediaStreamSource(
        new MediaStream(displayStream.getAudioTracks()),
      );
      src.connect(dest);
      if (!hasMic) src.connect(audioAnalyser);
    }
    if (hasMic && micStream) {
      const src = audioCtx.createMediaStreamSource(micStream);
      src.connect(dest);
      src.connect(audioAnalyser);
    }
    if (hasNarration && narrationEl) {
      // Route narration to the recording AND to speakers so the presenter
      // hears it while operating the nodes. Feed the analyser too, so the
      // sonic-avatar bars react to the narration waveform.
      try {
        const src = audioCtx.createMediaElementSource(narrationEl);
        src.connect(dest);
        src.connect(audioCtx.destination);
        src.connect(audioAnalyser);
      } catch (e) {
        console.error("[screenRecorder] narration source", e);
      }
    }
    for (const t of dest.stream.getAudioTracks()) mixed.addTrack(t);
  }


  const mimeType = pickMimeType();
  // Scale bitrate with pixel count so 4K doesn't look muddy. 8 Mbps for
  // 1080p ≈ 3.85 bpp; ~35 Mbps for 4K matches YouTube's 4K ingest guide.
  const pixels = targetW * targetH;
  const scaledBitrate = Math.round((pixels / (1920 * 1080)) * 8_000_000);
  const recorder = new MediaRecorder(mixed, {
    mimeType,
    videoBitsPerSecond: opts.videoBitsPerSecond ?? Math.max(4_000_000, Math.min(45_000_000, scaledBitrate)),
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
    hasNarration,
    narrationEl,
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
