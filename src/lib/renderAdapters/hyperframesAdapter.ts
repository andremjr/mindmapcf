import type { RenderAdapter } from "./index";

/**
 * hyperframesAdapter — formato declarativo orientado a "cenas" para HyperFrames.
 * Cada bloco vira uma cena, com câmera e SFX anexados.
 */
export const hyperframesAdapter: RenderAdapter = {
  id: "hyperframes",
  name: "HyperFrames",
  transform: (x) => {
    const sceneFor = (blockId: string) => ({
      cameras: x.cameraKeyframes.filter((k) => {
        const node = x.textNodes.find((n) => n.id === k.targetNodeId);
        return node?.blockId === blockId;
      }),
      sfx: x.sfxEvents.filter((s) => s.blockId === blockId),
    });
    return {
      version: 1,
      target: "hyperframes",
      project: x.project,
      stage: {
        width: x.renderConfig.width,
        height: x.renderConfig.height,
        fps: x.renderConfig.fps,
        safeArea: x.renderConfig.safeArea,
        preset: x.visualPreset,
      },
      scenes: x.transcriptBlocks.map((b) => {
        const node = x.textNodes.find((n) => n.blockId === b.id);
        const extras = sceneFor(b.id);
        return {
          id: b.id,
          start: b.start,
          end: b.end,
          type: b.type,
          text: b.text,
          shortText: b.shortText,
          node,
          ...extras,
        };
      }),
      audio: x.audio,
      mixing: x.renderConfig.audioMixing,
      assetRegistry: x.assetRegistry,
    };
  },
};
