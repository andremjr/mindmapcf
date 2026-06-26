/**
 * SFX Asset Registry — Canvas Narrativo
 *
 * Como adicionar novos SFX legalmente:
 *
 * 1. Baixe o arquivo de uma fonte com licença permissiva (CC0, CC-BY, MIT, Apache).
 *    Boas fontes:
 *      - https://freesound.org (filtre por CC0 / CC-BY)
 *      - https://kenney.nl/assets (CC0)
 *      - https://sonniss.com/gameaudiogdc (royalty-free)
 *      - https://opengameart.org (CC0 / CC-BY)
 *      - https://mixkit.co (Mixkit license)
 *
 * 2. Coloque o arquivo em `public/sfx/<kind>/<nome>.mp3` (ou .ogg).
 *
 * 3. Adicione uma entrada abaixo com TODOS os campos preenchidos:
 *      id, name, kind, file, origin: "public",
 *      license, author, sourceUrl, attributionRequired.
 *
 * 4. Se `attributionRequired` for `true`, lembre-se de exibir o crédito no
 *    rodapé do vídeo ou na descrição.
 *
 * Por padrão este registry contém apenas sons procedurais (synth:*) gerados
 * pelo `sfxService` via Web Audio API — totalmente livres de licença.
 * Eles funcionam como mock pronto-para-substituir.
 */

import type { SfxAsset, SfxKind } from "./types";

export const SFX_ASSETS: SfxAsset[] = [
  {
    id: "synth.whoosh_soft",
    name: "Soft Whoosh (synth)",
    kind: "whoosh_soft",
    file: "synth:whoosh_soft",
    origin: "synth",
    license: "CC0",
    author: "Canvas Narrativo (procedural)",
    sourceUrl: "internal://synth",
    attributionRequired: false,
    description: "Filtered noise sweep, short attack — for subtle camera pans.",
  },
  {
    id: "synth.whoosh_deep",
    name: "Deep Whoosh (synth)",
    kind: "whoosh_deep",
    file: "synth:whoosh_deep",
    origin: "synth",
    license: "CC0",
    author: "Canvas Narrativo (procedural)",
    sourceUrl: "internal://synth",
    attributionRequired: false,
    description: "Low-pass noise with long tail — wide camera moves.",
  },
  {
    id: "synth.focus_click",
    name: "Focus Click (synth)",
    kind: "focus_click",
    file: "synth:focus_click",
    origin: "synth",
    license: "CC0",
    author: "Canvas Narrativo (procedural)",
    sourceUrl: "internal://synth",
    attributionRequired: false,
  },
  {
    id: "synth.text_pop",
    name: "Text Pop (synth)",
    kind: "text_pop",
    file: "synth:text_pop",
    origin: "synth",
    license: "CC0",
    author: "Canvas Narrativo (procedural)",
    sourceUrl: "internal://synth",
    attributionRequired: false,
  },
  {
    id: "synth.zoom_riser",
    name: "Zoom Riser (synth)",
    kind: "zoom_riser",
    file: "synth:zoom_riser",
    origin: "synth",
    license: "CC0",
    author: "Canvas Narrativo (procedural)",
    sourceUrl: "internal://synth",
    attributionRequired: false,
  },
  {
    id: "synth.low_impact",
    name: "Low Impact (synth)",
    kind: "low_impact",
    file: "synth:low_impact",
    origin: "synth",
    license: "CC0",
    author: "Canvas Narrativo (procedural)",
    sourceUrl: "internal://synth",
    attributionRequired: false,
  },
  {
    id: "synth.transition_air",
    name: "Transition Air (synth)",
    kind: "transition_air",
    file: "synth:transition_air",
    origin: "synth",
    license: "CC0",
    author: "Canvas Narrativo (procedural)",
    sourceUrl: "internal://synth",
    attributionRequired: false,
  },
  {
    id: "synth.subtle_hit",
    name: "Subtle Hit (synth)",
    kind: "subtle_hit",
    file: "synth:subtle_hit",
    origin: "synth",
    license: "CC0",
    author: "Canvas Narrativo (procedural)",
    sourceUrl: "internal://synth",
    attributionRequired: false,
  },
  {
    id: "synth.marker_tick",
    name: "Marker Tick (synth)",
    kind: "marker_tick",
    file: "synth:marker_tick",
    origin: "synth",
    license: "CC0",
    author: "Canvas Narrativo (procedural)",
    sourceUrl: "internal://synth",
    attributionRequired: false,
  },

  // ------------------------------------------------------------------
  // EXEMPLO de entrada para um asset público real (descomente e adapte):
  //
  // {
  //   id: "kenney.ui_click_01",
  //   name: "UI Click 01",
  //   kind: "focus_click",
  //   file: "/sfx/focus_click/kenney_click01.mp3",
  //   origin: "public",
  //   license: "CC0",
  //   author: "Kenney.nl",
  //   sourceUrl: "https://kenney.nl/assets/interface-sounds",
  //   attributionRequired: false,
  // },
  // ------------------------------------------------------------------
];

export function getAssetById(id?: string): SfxAsset | undefined {
  if (!id) return undefined;
  return SFX_ASSETS.find((a) => a.id === id);
}

export function getAssetsForKind(kind: SfxKind): SfxAsset[] {
  // Normalize legacy aliases.
  const aliasMap: Partial<Record<SfxKind, SfxKind>> = {
    whoosh: "whoosh_soft",
    impact: "low_impact",
    tick: "marker_tick",
    rise: "zoom_riser",
    drop: "low_impact",
    transition: "transition_air",
  };
  const k = aliasMap[kind] ?? kind;
  return SFX_ASSETS.filter((a) => a.kind === k);
}

export function defaultAssetIdForKind(kind: SfxKind): string {
  const list = getAssetsForKind(kind);
  return list[0]?.id ?? "synth.subtle_hit";
}
