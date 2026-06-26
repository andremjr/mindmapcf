import React from "react";
import { Composition } from "remotion";
import { CanvasNarrativo } from "./CanvasNarrativo";
import { DEFAULT_PROPS, type CanvasNarrativoExport } from "./types";
import embeddedJson from "../project.json";

const INITIAL_PROPS: CanvasNarrativoExport =
  (embeddedJson as unknown as CanvasNarrativoExport) ?? DEFAULT_PROPS;

function resolveMetadata(p: CanvasNarrativoExport) {
  const rc: any = p.renderConfig ?? {};
  const proj: any = p.project ?? {};
  const duration =
    rc.durationSec ?? rc.duration ?? proj.durationSec ?? proj.duration ?? 10;
  const fps = rc.fps ?? 30;
  const width = rc.width ?? 1920;
  const height = rc.height ?? 1080;
  const durationInFrames = Math.max(1, Math.ceil(duration * fps));
  return { width, height, fps, durationInFrames };
}

const initial = resolveMetadata(INITIAL_PROPS);

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CanvasNarrativo"
      component={CanvasNarrativo}
      defaultProps={INITIAL_PROPS}
      width={initial.width}
      height={initial.height}
      fps={initial.fps}
      durationInFrames={initial.durationInFrames}
      calculateMetadata={({ props }) => {
        const p = props as CanvasNarrativoExport;
        const m = resolveMetadata(p);
        return { ...m, props: p };
      }}
    />
  );
};
