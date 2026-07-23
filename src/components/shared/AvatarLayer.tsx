import { SonicAvatarOverlay } from "@/components/mindmap/SonicAvatarOverlay";
import { useStore } from "@/lib/store";
import type { Project } from "@/lib/types";

/**
 * Shared Sonic Avatar overlay for every presentation template.
 * Rendered inside the recording frame so it is captured in the MP4.
 */
export function AvatarLayer({
  project,
  frameSize,
}: {
  project: Project;
  frameSize: { w: number; h: number };
}) {
  const avatars = useStore((s) => s.avatars);
  const usage = project.sonicAvatar;
  if (!usage?.enabled || !usage.avatarId) return null;
  const entry = avatars.find((a) => a.id === usage.avatarId);
  if (!entry) return null;
  return (
    <SonicAvatarOverlay
      avatar={entry}
      xPct={usage.xPct}
      yPct={usage.yPct}
      frameSize={frameSize}
      interactive
      onMove={(xPct, yPct) => {
        useStore.getState().setSonicAvatar(project.id, { xPct, yPct });
      }}
    />
  );
}
