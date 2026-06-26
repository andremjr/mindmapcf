import type { CameraKeyframe, CameraEase } from "./types";

function easeFn(e: CameraEase): (t: number) => number {
  switch (e) {
    case "linear":
      return (t) => t;
    case "ease-in":
      return (t) => t * t;
    case "ease-out":
      return (t) => 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    case "cinematic":
    default:
      return (t) => 1 - Math.pow(1 - t, 5);
  }
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  focusIntensity: number;
  depthIntensity: number;
  targetNodeId?: string;
}

const FALLBACK: CameraState = {
  x: 0,
  y: 0,
  zoom: 1,
  rotation: 0,
  focusIntensity: 0.6,
  depthIntensity: 0.6,
};

export function cameraAt(keyframes: CameraKeyframe[], time: number): CameraState {
  if (!keyframes || keyframes.length === 0) return FALLBACK;
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (time <= sorted[0].time) return toState(sorted[0]);
  if (time >= sorted[sorted.length - 1].time) return toState(sorted[sorted.length - 1]);

  let idx = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (time >= sorted[i].time && time < sorted[i + 1].time) {
      idx = i;
      break;
    }
  }
  const a = sorted[idx];
  const b = sorted[idx + 1];
  const span = Math.max(b.time - a.time, 0.001);
  const local = Math.min(1, Math.max(0, (time - a.time) / span));
  const k = easeFn(b.easing)(local);

  return {
    x: lerp(a.x, b.x, k),
    y: lerp(a.y, b.y, k),
    zoom: lerp(a.zoom, b.zoom, k),
    rotation: lerp(a.rotation, b.rotation, k),
    focusIntensity: lerp(a.focusIntensity, b.focusIntensity, k),
    depthIntensity: lerp(a.depthIntensity, b.depthIntensity, k),
    targetNodeId: k < 0.5 ? a.targetNodeId : b.targetNodeId,
  };
}

function toState(k: CameraKeyframe): CameraState {
  return {
    x: k.x,
    y: k.y,
    zoom: k.zoom,
    rotation: k.rotation,
    focusIntensity: k.focusIntensity,
    depthIntensity: k.depthIntensity,
    targetNodeId: k.targetNodeId,
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
