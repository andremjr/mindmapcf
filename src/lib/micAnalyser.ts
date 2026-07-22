// Standalone microphone AnalyserNode for visualizations OUTSIDE of a
// recording session. During recording, screenRecorder already exposes its
// analyser via getRecordingAnalyser(); this module covers the plain
// Presentation mode (no MediaRecorder running) so the sonic-avatar bars
// still react to the presenter's voice.
//
// The audio is NEVER routed to speakers or saved anywhere — it only feeds
// the analyser for frequency data.

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let stream: MediaStream | null = null;
let pending: Promise<AnalyserNode | null> | null = null;

export async function startMicAnalyser(): Promise<AnalyserNode | null> {
  if (analyser) return analyser;
  if (pending) return pending;
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return null;
  }
  pending = (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser); // NOT connected to destination → no playback
      return analyser;
    } catch (e) {
      console.warn("[micAnalyser] mic denied or unavailable", e);
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

export function getMicAnalyser(): AnalyserNode | null {
  return analyser;
}

export function stopMicAnalyser(): void {
  try {
    if (stream) for (const t of stream.getTracks()) t.stop();
  } catch {
    /* ignore */
  }
  try {
    ctx?.close();
  } catch {
    /* ignore */
  }
  stream = null;
  ctx = null;
  analyser = null;
}
