import type { SoundPreset, SfxKind } from "./types";
import { defaultAssetIdForKind } from "./sfxAssets";

function soundsFor(kinds: SfxKind[]): Partial<Record<SfxKind, string>> {
  const map: Partial<Record<SfxKind, string>> = {};
  for (const k of kinds) map[k] = defaultAssetIdForKind(k);
  return map;
}

const ALL_KINDS: SfxKind[] = [
  "whoosh_soft",
  "whoosh_deep",
  "focus_click",
  "text_pop",
  "zoom_riser",
  "low_impact",
  "transition_air",
  "subtle_hit",
  "marker_tick",
];

export const SOUND_PRESETS: SoundPreset[] = [
  {
    id: "minimal",
    name: "Minimal",
    masterVolume: 0.55,
    sounds: soundsFor(["focus_click", "text_pop", "marker_tick", "whoosh_soft"]),
    frequency: 0.4,
    intensity: 0.35,
    playImpactOnStrongIdea: false,
    playClickOnNodeFocus: true,
    playWhooshOnCameraMove: true,
    duckOnSpeech: true,
  },
  {
    id: "cinematic",
    name: "Cinematic",
    masterVolume: 0.8,
    sounds: soundsFor(ALL_KINDS),
    frequency: 0.85,
    intensity: 0.85,
    playImpactOnStrongIdea: true,
    playClickOnNodeFocus: true,
    playWhooshOnCameraMove: true,
    duckOnSpeech: true,
  },
  {
    id: "tech",
    name: "Tech",
    masterVolume: 0.7,
    sounds: soundsFor([
      "focus_click",
      "text_pop",
      "marker_tick",
      "zoom_riser",
      "transition_air",
      "subtle_hit",
    ]),
    frequency: 0.7,
    intensity: 0.6,
    playImpactOnStrongIdea: false,
    playClickOnNodeFocus: true,
    playWhooshOnCameraMove: true,
    duckOnSpeech: true,
  },
  {
    id: "dark",
    name: "Dark",
    masterVolume: 0.85,
    sounds: soundsFor([
      "whoosh_deep",
      "low_impact",
      "zoom_riser",
      "subtle_hit",
      "transition_air",
    ]),
    frequency: 0.6,
    intensity: 1,
    playImpactOnStrongIdea: true,
    playClickOnNodeFocus: false,
    playWhooshOnCameraMove: true,
    duckOnSpeech: true,
  },
];

export const DEFAULT_SOUND_PRESET = SOUND_PRESETS[1];

export function getSoundPreset(id: string): SoundPreset {
  return SOUND_PRESETS.find((p) => p.id === id) ?? DEFAULT_SOUND_PRESET;
}
