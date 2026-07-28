import { useState } from "react";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SonicAvatarDialog } from "@/components/mindmap/SonicAvatarDialog";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import type { Project } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

/**
 * Shared toolbar button to configure the Sonic Avatar for any template.
 * Handles Pro gating + upgrade dialog + selection dialog.
 */
export function AvatarToolbarButton({
  project,
  user,
  isPro,
}: {
  project: Project;
  user: User | null | undefined;
  isPro: boolean;
}) {
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const active = !!(project.sonicAvatar?.avatarId && project.sonicAvatar?.enabled);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (!isPro) {
            setUpgradeOpen(true);
            return;
          }
          setAvatarOpen(true);
        }}
        className="gap-2"
        title={isPro ? "Escolher avatar sonoro para gravação" : "Recurso Pro"}
      >
        <Mic className="size-4" />
        {active ? "Avatar ✓" : "Avatar"}
      </Button>

      {user?.id && (
        <SonicAvatarDialog
          userId={user.id}
          isPro={isPro}
          open={avatarOpen}
          onClose={() => setAvatarOpen(false)}
          selectionProjectId={project.id}
          onUpgrade={() => {
            setAvatarOpen(false);
            setUpgradeOpen(true);
          }}
        />
      )}

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} user={user ?? null} />
    </>
  );
}
