import React from "react";
import { Composition } from "remotion";
import { CanvasNarrativo } from "./CanvasNarrativo";
import { DEFAULT_PROPS, type CanvasNarrativoExport } from "./types";

// Embedded project JSON — written by the app when generating the renderer zip.
// Falls back to DEFAULT_PROPS demo if the file is missing.
// eslint-disable-next-line @typescript-eslint/no-var-requires
let embeddedProject: CanvasNarrativoExport | null = null;
try {
  // @ts-expect-error — project.json shipped at zip root, resolved relative to src/
  embeddedProject = require("../project.json") as CanvasNarrativoExport;
} catch {
  embeddedProject = null;
}

const INITIAL_PROPS: CanvasNarrativoExport = embeddedProject ?? DEFAULT_PROPS;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CanvasNarrativo"
      component={CanvasNarrativo}
      defaultProps={INITIAL_PROPS}
      width={INITIAL_PROPS.renderConfig?.width ?? 1920}
      height={INITIAL_PROPS.renderConfig?.height ?? 1080}
      fps={INITIAL_PROPS.renderConfig?.fps ?? 30}
      durationInFrames={Math.max(
        1,
        Math.ceil(
          (INITIAL_PROPS.renderConfig?.durationSec ??
            INITIAL_PROPS.project?.durationSec ??
            12) * (INITIAL_PROPS.renderConfig?.fps ?? 30),
        ),
      )}
      calculateMetadata={({ props }) => {
        const p = props as CanvasNarrativoExport;
        const rc = p.renderConfig ?? INITIAL_PROPS.renderConfig ?? DEFAULT_PROPS.renderConfig;
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
