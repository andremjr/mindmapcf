import type {
  CameraKeyframe,
  SfxEvent,
  SoundPreset,
  TranscriptBlock,
  TextNode,
  SfxKind,
  SfxTrigger,
} from "./types";
import { defaultAssetIdForKind } from "./sfxAssets";

const STRONG_KEYWORDS = [
  "atenção",
  "importante",
  "nunca",
  "sempre",
  "segredo",
  "verdade",
  "mude",
  "agora",
  "tudo",
  "perigo",
  "chave",
];

interface GenInput {
  blocks: TranscriptBlock[];
  nodes: TextNode[];
  camera: CameraKeyframe[];
  preset: SoundPreset;
  durationSec: number;
}

function add(
  out: SfxEvent[],
  partial: Omit<SfxEvent, "id" | "soundId" | "enabled"> & { kind: SfxKind },
  preset: SoundPreset,
  idx: number,
) {
  const soundId = preset.sounds[partial.kind] ?? defaultAssetIdForKind(partial.kind);
  out.push({
    id: `sfx_${idx}_${partial.kind}_${Math.round(partial.time * 100)}`,
    enabled: true,
    soundId,
    ...partial,
  });
}

export function generateSfx({
  blocks,
  nodes,
  camera,
  preset,
  durationSec,
}: GenInput): SfxEvent[] {
  const out: SfxEvent[] = [];
  let counter = 0;

  // 1) Câmera começa a se mover → whoosh; chegada ao nó → focus_click
  if (preset.playWhooshOnCameraMove || preset.playClickOnNodeFocus) {
    camera.forEach((k, i) => {
      const prev = camera[i - 1];
      const moved =
        !prev || Math.hypot(k.x - prev.x, k.y - prev.y) > 60 || Math.abs(k.zoom - (prev?.zoom ?? 1)) > 0.15;
      if (preset.playWhooshOnCameraMove && moved) {
        const big = Math.hypot(k.x - (prev?.x ?? 0), k.y - (prev?.y ?? 0)) > 400;
        add(
          out,
          {
            time: Math.max(0, k.time - 0.15),
            kind: big ? "whoosh_deep" : "whoosh_soft",
            volume: 0.5 + preset.intensity * 0.3,
            nodeId: k.targetNodeId,
            trigger: "camera_move" as SfxTrigger,
          },
          preset,
          counter++,
        );
      }
      if (preset.playClickOnNodeFocus && k.targetNodeId) {
        add(
          out,
          {
            time: k.time + Math.max(0.1, k.duration * 0.6),
            kind: "focus_click",
            volume: 0.4 + preset.intensity * 0.2,
            nodeId: k.targetNodeId,
            trigger: "node_focus",
          },
          preset,
          counter++,
        );
      }
      if (k.zoom > 1.4) {
        add(
          out,
          {
            time: Math.max(0, k.time - 0.1),
            kind: "zoom_riser",
            volume: 0.45 + preset.intensity * 0.3,
            nodeId: k.targetNodeId,
            trigger: "zoom_in",
          },
          preset,
          counter++,
        );
      }
    });
  }

  // 2) Bloco do tipo problem/solution/warning/conclusion → low_impact
  // 3) Palavra-chave forte → text_pop
  blocks.forEach((b) => {
    if (
      preset.playImpactOnStrongIdea &&
      (b.type === "problem" || b.type === "solution" || b.type === "warning" || b.type === "conclusion")
    ) {
      add(
        out,
        {
          time: b.start + 0.05,
          kind: "low_impact",
          volume: 0.55 + b.emphasis * 0.3,
          blockId: b.id,
          trigger: "strong_idea",
        },
        preset,
        counter++,
      );
    }
    const lower = b.text.toLowerCase();
    if (STRONG_KEYWORDS.some((kw) => lower.includes(kw))) {
      add(
        out,
        {
          time: b.start + Math.min(0.6, b.duration * 0.3),
          kind: "text_pop",
          volume: 0.45 + b.emphasis * 0.2,
          blockId: b.id,
          trigger: "text_emphasis",
        },
        preset,
        counter++,
      );
    }
  });

  // 4) Aplicar frequência (sortear quais eventos manter)
  // Mantemos sempre eventos de strong_idea; reduzimos os demais.
  const filtered = out.filter((e, i) => {
    if (e.trigger === "strong_idea" || e.trigger === "zoom_in") return true;
    // pseudo-random determinístico
    const r = ((i * 9301 + 49297) % 233280) / 233280;
    return r < preset.frequency;
  });

  // 5) Validações: dentro da duração e não duplicados muito próximos do mesmo tipo
  const valid: SfxEvent[] = [];
  for (const e of filtered.sort((a, b) => a.time - b.time)) {
    if (e.time < 0 || e.time > durationSec + 0.5) continue;
    const last = valid[valid.length - 1];
    if (last && last.kind === e.kind && e.time - last.time < 0.12) continue;
    valid.push(e);
  }

  // silencia warning unused
  void nodes;
  return valid;
}
