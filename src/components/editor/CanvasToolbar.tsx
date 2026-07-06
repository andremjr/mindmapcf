import {
  Wand2,
  Shuffle,
  Crosshair,
  Maximize,
  RotateCcw,
  Bug,
} from "lucide-react";
import type { Project, SafeArea } from "@/lib/types";
import { useStore, fitViewport } from "@/lib/store";
import { VISUAL_PRESETS } from "@/lib/presets";

const SAFE_AREAS: SafeArea[] = ["16:9", "9:16", "1:1"];

export function CanvasToolbar({
  project,
  debug,
  onToggleDebug,
}: {
  project: Project;
  debug?: boolean;
  onToggleDebug?: () => void;
}) {
  const regenerateLayout = useStore((s) => s.regenerateLayout);
  const rebuildCamera = useStore((s) => s.rebuildCamera);
  const setViewport = useStore((s) => s.setViewport);
  const resetCamera = useStore((s) => s.resetCamera);
  const setSafeArea = useStore((s) => s.setSafeArea);
  const setPreset = useStore((s) => s.setPreset);
  const playback = useStore((s) => s.playback);
  const setSelected = useStore((s) => s.setSelectedNode);

  const centerOnActive = () => {
    const id = playback.selectedNodeId;
    const node = project.nodes.find((n) => n.id === id) ?? project.nodes[0];
    if (!node) return;
    setViewport({ x: node.x, y: node.y, zoom: 1.4 });
  };

  const seeAll = () => {
    if (project.nodes.length === 0) return;
    const v = fitViewport(project.nodes, 1400, 800, 300);
    setViewport(v);
    setSelected(undefined);
  };

  return (
    <div className="absolute top-3 left-3 right-3 z-10 flex items-center gap-2 flex-wrap">
      <div className="surface-card flex items-center gap-1 px-1 py-1">
        <ToolBtn
          onClick={() => {
            regenerateLayout(project.id, 7);
          }}
          icon={<Wand2 className="size-3.5" />}
          label="Gerar layout"
        />
        <ToolBtn
          onClick={() => regenerateLayout(project.id)}
          icon={<Shuffle className="size-3.5" />}
          label="Reorganizar"
        />
        <ToolBtn
          onClick={centerOnActive}
          icon={<Crosshair className="size-3.5" />}
          label="Centralizar ativo"
        />
        <ToolBtn
          onClick={seeAll}
          icon={<Maximize className="size-3.5" />}
          label="Ver mapa"
        />
        <ToolBtn
          onClick={resetCamera}
          icon={<RotateCcw className="size-3.5" />}
          label="Resetar câmera"
        />
        <ToolBtn
          onClick={() => rebuildCamera(project.id)}
          label="Recriar câmera"
        />
      </div>

      <select
        value={project.visualPreset.id}
        onChange={(e) => setPreset(project.id, e.target.value)}
        className="surface-card text-[11px] px-2 py-1.5 bg-transparent outline-none"
        title="Preset visual"
      >
        {VISUAL_PRESETS.map((p) => (
          <option key={p.id} value={p.id} className="bg-background">
            {p.name}
          </option>
        ))}
      </select>

      <div className="surface-card flex items-center gap-1 px-1 py-1">
        {SAFE_AREAS.map((a) => (
          <button
            key={a}
            onClick={() => setSafeArea(project.id, a)}
            className={`px-2 py-1 text-[11px] rounded transition ${
              project.safeArea === a
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolBtn({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 text-[11px] rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition"
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
