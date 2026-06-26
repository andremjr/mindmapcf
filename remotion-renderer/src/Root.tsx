import React from "react";
import { Composition } from "remotion";
import { CanvasNarrativo } from "./CanvasNarrativo";
import { DEFAULT_PROPS, type CanvasNarrativoExport } from "./types";

export const RemotionRoot: React.FC = () => {
  // calculateMetadata lets the composition adapt to the JSON passed via --props.
  return (
    <Composition
      id="CanvasNarrativo"
      component={CanvasNarrativo}
      defaultProps={DEFAULT_PROPS}
      // initial values — overridden by calculateMetadata
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={360}
      calculateMetadata={({ props }) => {
        const p = props as CanvasNarrativoExport;
        const rc = p.renderConfig ?? DEFAULT_PROPS.renderConfig;
        const duration = Math.max(
          1,
          Math.ceil((rc.durationSec ?? p.project?.durationSec ?? 12) * (rc.fps ?? 30)),
        );
        return {
          width: rc.width ?? 1920,
          height: rc.height ?? 1080,
          fps: rc.fps ?? 30,
          durationInFrames: duration,
          props: p,
        };
      }}
    />
  );
};
