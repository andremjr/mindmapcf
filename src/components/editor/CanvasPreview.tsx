import { useMemo } from "react";
import type { Project } from "@/lib/types";
import type { EditorStep } from "./LeftSidebar";

export function CanvasPreview({ project, step }: { project: Project; step: EditorStep }) {
  const viewBox = useMemo(() => {
    if (project.nodes.length === 0) return "-800 -600 1600 1200";
    const xs = project.nodes.map((n) => n.x);
    const ys = project.nodes.map((n) => n.y);
    const minX = Math.min(...xs) - 300;
    const maxX = Math.max(...xs) + 300;
    const minY = Math.min(...ys) - 200;
    const maxY = Math.max(...ys) + 200;
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }, [project.nodes]);

  return (
    <div className="h-full w-full relative overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, oklch(0.18 0.012 270) 0%, oklch(0.13 0.012 270) 70%)",
        }}
      />
      {/* Grid */}
      <svg className="absolute inset-0 w-full h-full opacity-30" aria-hidden="true">
        <defs>
          <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="oklch(1 0 0 / 0.05)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Canvas content */}
      <svg
        className="relative w-full h-full"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Camera path */}
        {project.camera.length > 1 && (
          <polyline
            points={project.camera.map((c) => `${c.x},${c.y}`).join(" ")}
            fill="none"
            stroke="oklch(0.78 0.16 220 / 0.25)"
            strokeWidth="2"
            strokeDasharray="6 6"
          />
        )}
        {project.nodes.map((n) => {
          const size = 22 + (n.scale - 1) * 16;
          const opacity = n.variant === "headline" ? 1 : n.variant === "accent" ? 0.85 : 0.6;
          const fill = n.variant === "accent" ? "oklch(0.78 0.16 220)" : "oklch(0.97 0.005 250)";
          return (
            <g key={n.id} transform={`translate(${n.x} ${n.y}) rotate(${n.rotation})`} opacity={opacity}>
              <text
                fontFamily="Inter"
                fontSize={size}
                fontWeight={n.fontWeight}
                fill={fill}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ letterSpacing: "-0.02em" }}
              >
                {n.text}
              </text>
            </g>
          );
        })}
        {/* Camera focus markers */}
        {project.camera.map((c) => (
          <circle key={c.id} cx={c.x} cy={c.y} r="6" fill="oklch(0.78 0.16 220)" opacity="0.6" />
        ))}
      </svg>

      {/* Overlay */}
      <div className="absolute top-4 left-4 surface-card px-3 py-2 text-[11px] text-muted-foreground text-mono">
        {step.toUpperCase()} · {project.nodes.length} nós · {project.camera.length} keyframes
      </div>
      {project.nodes.length === 0 && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="surface-card px-6 py-4 text-center max-w-sm">
            <p className="text-sm text-muted-foreground">
              O canvas será gerado depois que você criar os blocos de fala.
            </p>
          </div>
        </div>
      )}
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, transparent 50%, oklch(0 0 0 / 0.5) 100%)" }}
      />
    </div>
  );
}
