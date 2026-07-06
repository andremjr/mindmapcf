/**
 * sfxBaker — renderiza os SFX sintéticos do Canvas Narrativo em WAVs
 * usando OfflineAudioContext. Assim o pacote Remotion recebe arquivos
 * reais e consegue tocá-los durante o render.
 */

import type { SfxKind } from "./types";

type SynthKind =
  | "whoosh_soft"
  | "whoosh_deep"
  | "transition_air"
  | "focus_click"
  | "marker_tick"
  | "subtle_hit"
  | "text_pop"
  | "zoom_riser"
  | "low_impact";

const SYNTH_ALIAS: Partial<Record<SfxKind, SynthKind>> = {
  transition_air: "whoosh_soft",
  marker_tick: "focus_click",
  subtle_hit: "focus_click",
};

export function synthKindFor(kind: SfxKind): SynthKind {
  return (SYNTH_ALIAS[kind] as SynthKind) ?? (kind as SynthKind);
}

const SAMPLE_RATE = 44100;

function fillNoise(buf: AudioBuffer, dur: number) {
  const len = Math.floor(SAMPLE_RATE * dur);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len && i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

async function renderKind(kind: SynthKind): Promise<AudioBuffer> {
  const OfflineCtx: typeof OfflineAudioContext =
    (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext })
      .OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  const duration = 1.2; // segundos — cabe qualquer SFX
  const ctx = new OfflineCtx(1, Math.ceil(SAMPLE_RATE * duration), SAMPLE_RATE);
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  const t0 = 0;
  const vol = 1;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(master);

  switch (kind) {
    case "whoosh_soft":
    case "whoosh_deep":
    case "transition_air": {
      const deep = kind === "whoosh_deep";
      const dur = deep ? 0.9 : 0.45;
      const noiseBuf = ctx.createBuffer(1, Math.floor(SAMPLE_RATE * dur), SAMPLE_RATE);
      fillNoise(noiseBuf, dur);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const filt = ctx.createBiquadFilter();
      filt.type = "bandpass";
      filt.Q.value = deep ? 0.7 : 1.2;
      filt.frequency.setValueAtTime(deep ? 300 : 1200, t0);
      filt.frequency.exponentialRampToValueAtTime(deep ? 1200 : 400, t0 + dur);
      noise.connect(filt).connect(g);
      g.gain.linearRampToValueAtTime(vol * 0.6, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      noise.start(t0);
      noise.stop(t0 + dur + 0.05);
      break;
    }
    case "focus_click":
    case "marker_tick":
    case "subtle_hit": {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(kind === "marker_tick" ? 1800 : 900, t0);
      osc.frequency.exponentialRampToValueAtTime(120, t0 + 0.08);
      osc.connect(g);
      g.gain.linearRampToValueAtTime(vol * 0.7, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      osc.start(t0);
      osc.stop(t0 + 0.1);
      break;
    }
    case "text_pop": {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(420, t0);
      osc.frequency.exponentialRampToValueAtTime(720, t0 + 0.05);
      osc.frequency.exponentialRampToValueAtTime(220, t0 + 0.15);
      osc.connect(g);
      g.gain.linearRampToValueAtTime(vol * 0.6, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      osc.start(t0);
      osc.stop(t0 + 0.22);
      break;
    }
    case "zoom_riser": {
      const dur = 0.7;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(120, t0);
      osc.frequency.exponentialRampToValueAtTime(1400, t0 + dur);
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.setValueAtTime(400, t0);
      filt.frequency.exponentialRampToValueAtTime(3500, t0 + dur);
      osc.connect(filt).connect(g);
      g.gain.linearRampToValueAtTime(vol * 0.5, t0 + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
      break;
    }
    case "low_impact": {
      const dur = 0.6;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, t0);
      osc.frequency.exponentialRampToValueAtTime(40, t0 + dur);
      const noiseBuf = ctx.createBuffer(1, Math.floor(SAMPLE_RATE * 0.15), SAMPLE_RATE);
      fillNoise(noiseBuf, 0.15);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const nFilt = ctx.createBiquadFilter();
      nFilt.type = "lowpass";
      nFilt.frequency.value = 600;
      noise.connect(nFilt).connect(g);
      osc.connect(g);
      g.gain.linearRampToValueAtTime(vol * 0.9, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.start(t0);
      noise.start(t0);
      osc.stop(t0 + dur + 0.05);
      noise.stop(t0 + 0.2);
      break;
    }
  }

  return await ctx.startRendering();
}

/** Codifica um AudioBuffer mono em WAV PCM 16-bit (Uint8Array). */
function encodeWav(buffer: AudioBuffer): Uint8Array {
  const channels = 1;
  const sr = buffer.sampleRate;
  const samples = buffer.getChannelData(0);
  // Encontra o último sample não-silencioso para cortar zeros.
  let end = samples.length;
  while (end > 0 && Math.abs(samples[end - 1]) < 1e-4) end--;
  const usable = Math.max(1024, end);
  const dataLen = usable * 2 * channels;
  const bufOut = new ArrayBuffer(44 + dataLen);
  const view = new DataView(bufOut);

  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2 * channels, true);
  view.setUint16(32, 2 * channels, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);

  let offset = 44;
  for (let i = 0; i < usable; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(bufOut);
}

/** Renderiza um conjunto de synth kinds em WAVs. */
export async function bakeSynthSfx(
  kinds: SynthKind[],
): Promise<Record<SynthKind, Uint8Array>> {
  const out: Partial<Record<SynthKind, Uint8Array>> = {};
  const uniq = Array.from(new Set(kinds));
  for (const k of uniq) {
    try {
      const buf = await renderKind(k);
      out[k] = encodeWav(buf);
    } catch (err) {
      console.warn(`[sfxBaker] Falha ao renderizar ${k}:`, err);
    }
  }
  return out as Record<SynthKind, Uint8Array>;
}
