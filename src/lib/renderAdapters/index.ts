import type { RenderExport } from "../renderExport";
import { remotionAdapter } from "./remotionAdapter";
import { hyperframesAdapter } from "./hyperframesAdapter";
import { genericRenderAdapter } from "./genericRenderAdapter";

export interface RenderAdapter {
  id: string;
  name: string;
  /** Transform the canonical export into the target-specific payload. */
  transform: (x: RenderExport) => unknown;
}

export const RENDER_ADAPTERS: Record<string, RenderAdapter> = {
  remotion: remotionAdapter,
  hyperframes: hyperframesAdapter,
  generic: genericRenderAdapter,
};

export { remotionAdapter, hyperframesAdapter, genericRenderAdapter };
