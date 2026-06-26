import React from "react";
import { Composition } from "remotion";
import { CanvasNarrativo } from "./CanvasNarrativo";
import { DEFAULT_PROPS, type CanvasNarrativoExport } from "./types";
import embeddedJson from "../project.json";

const INITIAL_PROPS: CanvasNarrativoExport =
  (embeddedJson as unknown as CanvasNarrativoExport) ?? DEFAULT_PROPS;

const rc0 = INITIAL_PROPS.renderConfig ?? DEFAULT_PROPS.renderConfig;
const initialDuration = Math.max(
  1,
  Math.ceil((rc0.durationSec ?? INITIAL_PROPS.project?.durationSec ?? 12) * (rc0.fps ?? 30)),
);

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CanvasNarrativo"
      component={CanvasNarrativo}
      defaultProps={INITIAL_PROPS}
      width={rc0.width ?? 1920}
      height={rc0.height ?? 1080}
      fps={rc0.fps ?? 30}
      durationInFrames={initialDuration}
      calculateMetadata={({ props }) => {
        const p = props as CanvasNarrativoExport;
        const rc = p.renderConfig ?? rc0;
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
