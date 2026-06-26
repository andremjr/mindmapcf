/**
 * sfxService — controla carregamento, mix e disparo de SFX.
 *
 * Usa Web Audio API nativa (zero dependências de terceiros) — é a opção
 * mais leve e 100% livre de licenças. Para usar bibliotecas como Howler.js,
 * basta trocar a implementação interna mantendo a mesma API pública.
 *
 * Sons "synth:*" são gerados proceduralmente (ruído filtrado, osciladores)
 * e servem de placeholder até que arquivos reais (CC0 / CC-BY) sejam
 * adicionados em `public/sfx/` e registrados em `sfxAssets.ts`.
 */

import type { SfxEvent, SfxKind, SoundPreset } from "./types";
import { SFX_ASSETS, defaultAssetIdForKind, getAssetById } from "./sfxAssets";

type SynthKind =
  | "whoosh_soft"
  | "whoosh_deep"
  | "focus_click"
  | "text_pop"
  | "zoom_riser"
  | "low_impact"
  | "transition_air"
  | "subtle_hit"
  | "marker_tick";

class SfxService {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private muted = false;
  private masterVolume = 0.8;
  private firedKeys = new Set<string>();
  private lastResetTime = 0;

  private ensureCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (this.ctx) return this.ctx;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : this.masterVolume;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
    } catch {
      return null;
    }
    return this.ctx;
  }

  /** Chame em resposta a um gesto de usuário (play button) para liberar áudio. */
  async unlock(): Promise<void> {
    const ctx = this.ensureCtx();
    if (ctx && ctx.state === "suspended") await ctx.resume();
  }

  setMasterVolume(v: number) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.muted ? 0 : this.masterVolume;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.masterVolume;
  }

  isMuted() {
    return this.muted;
  }

  /** Pré-carrega todos os assets registrados (para arquivos reais; synth é noop). */
  async preloadAll(): Promise<void> {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    await Promise.all(
      SFX_ASSETS.filter((a) => a.origin !== "synth").map(async (a) => {
        if (this.buffers.has(a.id)) return;
        try {
          const res = await fetch(a.file);
          if (!res.ok) return;
          const buf = await res.arrayBuffer();
          const decoded = await ctx.decodeAudioData(buf);
          this.buffers.set(a.id, decoded);
        } catch {
          // silencioso — synth fallback será usado
        }
      }),
    );
  }

  /** Reset do estado de "eventos já disparados" — chame ao dar seek/pause. */
  resetTriggers(time = 0) {
    this.firedKeys.clear();
    this.lastResetTime = time;
  }

  /** Avança no tempo: dispara eventos cujo time já passou desde o último tick. */
  tick(events: SfxEvent[], time: number, preset: SoundPreset) {
    // Se voltamos no tempo, resetar
    if (time + 0.05 < this.lastResetTime) this.resetTriggers(time);
    this.lastResetTime = time;
    if (this.muted) return;

    for (const e of events) {
      if (e.enabled === false) continue;
      if (e.time > time) continue;
      if (e.time < time - 0.4) continue; // muito antigo
      if (this.firedKeys.has(e.id)) continue;
      this.firedKeys.add(e.id);
      this.playEvent(e, preset);
    }
  }

  playEvent(e: SfxEvent, preset: SoundPreset) {
    const ctx = this.ensureCtx();
    if (!ctx || !this.master) return;
    const assetId = e.soundId ?? preset.sounds[e.kind] ?? defaultAssetIdForKind(e.kind);
    const asset = getAssetById(assetId);
    const vol = Math.max(0, Math.min(1, (e.volume ?? 0.7) * preset.intensity));
    if (asset?.origin === "public" && this.buffers.has(asset.id)) {
      const src = ctx.createBufferSource();
      src.buffer = this.buffers.get(asset.id)!;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(g).connect(this.master);
      src.start();
      return;
    }
    // fallback: procedural
    this.synth(this.synthKindFor(e.kind), vol);
  }

  private synthKindFor(kind: SfxKind): SynthKind {
    const aliasMap: Partial<Record<SfxKind, SynthKind>> = {
      whoosh: "whoosh_soft",
      impact: "low_impact",
      tick: "marker_tick",
      rise: "zoom_riser",
      drop: "low_impact",
      transition: "transition_air",
      ambient: "transition_air",
    };
    return (aliasMap[kind] ?? (kind as SynthKind)) as SynthKind;
  }

  /** Síntese procedural via Web Audio. Mantém SFX 100% livre de licenças. */
  private synth(kind: SynthKind, vol: number) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(master);

    switch (kind) {
      case "whoosh_soft":
      case "whoosh_deep":
      case "transition_air": {
        const deep = kind === "whoosh_deep";
        const dur = deep ? 0.9 : 0.45;
        const noise = makeNoise(ctx, dur);
        const filt = ctx.createBiquadFilter();
        filt.type = "bandpass";
        filt.Q.value = deep ? 0.7 : 1.2;
        filt.frequency.setValueAtTime(deep ? 300 : 1200, t0);
        filt.frequency.exponentialRampToValueAtTime(deep ? 1200 : 400, t0 + dur);
        noise.connect(filt).connect(g);
        g.gain.linearRampToValueAtTime(vol * 0.6, t0 + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        noise.start();
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
        osc.start();
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
        osc.start();
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
        osc.start();
        osc.stop(t0 + dur + 0.05);
        break;
      }
      case "low_impact": {
        const dur = 0.6;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(120, t0);
        osc.frequency.exponentialRampToValueAtTime(40, t0 + dur);
        const noise = makeNoise(ctx, 0.15);
        const nFilt = ctx.createBiquadFilter();
        nFilt.type = "lowpass";
        nFilt.frequency.value = 600;
        noise.connect(nFilt).connect(g);
        osc.connect(g);
        g.gain.linearRampToValueAtTime(vol * 0.9, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.start();
        noise.start();
        osc.stop(t0 + dur + 0.05);
        noise.stop(t0 + 0.2);
        break;
      }
    }
  }
}

function makeNoise(ctx: AudioContext, dur: number): AudioBufferSourceNode {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * dur));
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

export const sfxService = new SfxService();
