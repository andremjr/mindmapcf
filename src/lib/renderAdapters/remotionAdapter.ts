import type { RenderAdapter } from "./index";

/**
 * remotionAdapter — converte o RenderExport canônico em props para uma
 * composição Remotion. O lado Remotion deve:
 *   - registrar `Composition` com width/height/fps/durationInFrames = fps * durationSec
 *   - passar `inputProps` = output deste transform
 *   - usar `interpolate` entre cameraKeyframes (time em segundos → frame)
 */
export const remotionAdapter: RenderAdapter = {
  id: "remotion",
  name: "Remotion",
  transform: (x) => {
    const fps = x.renderConfig.fps;
    return {
      compositionId: x.project.id,
      width: x.renderConfig.width,
      height: x.renderConfig.height,
      fps,
      durationInFrames: Math.ceil(x.renderConfig.durationSec * fps),
      inputProps: {
        visualPreset: x.visualPreset,
        soundPreset: x.soundPreset,
        nodes: x.textNodes,
        blocks: x.transcriptBlocks,
        camera: x.cameraKeyframes.map((k) => ({ ...k, frame: Math.round(k.time * fps) })),
        sfx: x.sfxEvents.map((s) => ({ ...s, frame: Math.round(s.time * fps) })),
        audioSrc: x.audio?.objectUrl ?? null,
        safeArea: x.renderConfig.safeArea,
        textScale: x.renderConfig.textScale,
        motionIntensity: x.renderConfig.motionIntensity,
        depthIntensity: x.renderConfig.depthIntensity,
        audioMixing: x.renderConfig.audioMixing,
        assetRegistry: x.assetRegistry,
      },
    };
  },
};
