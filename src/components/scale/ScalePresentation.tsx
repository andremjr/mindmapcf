import { useEffect, useMemo, useState } from "react";
import type { MindNode, Project } from "@/lib/types";
import { resolveImage } from "@/lib/imageStorage";
import { PresentationShell } from "@/components/shared/PresentationShell";
import { AvatarLayer } from "@/components/shared/AvatarLayer";
import { formatValue, parseItemData, parseScaleConfig } from "@/lib/scaleConfig";
import { orderItems, mix } from "./ScaleEditor";

/* ---------- image resolver ---------- */
function useResolvedImage(node: MindNode | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const key = node?.imageRef?.id ?? node?.image ?? "";
  useEffect(() => {
    if (!node) { setUrl(null); return; }
    if (node.image) { setUrl(node.image); return; }
    if (!node.imageRef) { setUrl(null); return; }
    let alive = true;
    resolveImage(node.imageRef).then((u) => alive && setUrl(u));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

/* ================================================================= */
/* Steps: overview → focus 0 → focus 1 → ... → focus N-1 → overview   */
type Step = { kind: "overview" } | { kind: "focus"; index: number };

export function ScalePresentation({ project, recording }: { project: Project; recording: boolean }) {
  const rootNode = project.nodes.find((n) => n.role === "scale" || !n.parentId);
  const items = useMemo(
    () => project.nodes.filter((n) => n.role === "item" && n.parentId === rootNode?.id),
    [project.nodes, rootNode?.id],
  );
  const config = useMemo(() => parseScaleConfig(rootNode?.body), [rootNode?.body]);
  const ordered = useMemo(() => orderItems(items, config.sortMode), [items, config.sortMode]);

  const [stepIdx, setStepIdx] = useState(0);

  const steps: Step[] = useMemo(() => {
    const list: Step[] = [{ kind: "overview" }];
    ordered.forEach((_, i) => list.push({ kind: "focus", index: i }));
    list.push({ kind: "overview" });
    return list;
  }, [ordered]);

  useEffect(() => {
    if (stepIdx >= steps.length) setStepIdx(Math.max(0, steps.length - 1));
  }, [steps.length, stepIdx]);

  const active = steps[stepIdx] ?? { kind: "overview" };
  const focusIndex = active.kind === "focus" ? active.index : null;

  return (
    <PresentationShell
      project={project}
      recording={recording}
      navLabel={`${stepIdx + 1} / ${steps.length}`}
      onNext={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))}
      onPrev={() => setStepIdx((i) => Math.max(0, i - 1))}
      canNext={stepIdx < steps.length - 1}
      canPrev={stepIdx > 0}
      frameBg="bg-[#0b1220]"
    >
      {({ size }) => (
        <ScaleFrame
          size={size}
          items={ordered}
          config={config}
          focusIndex={focusIndex}
          isOverview={active.kind === "overview"}
          project={project}
        />
      )}
    </PresentationShell>
  );
}

/* ---------- head (image + name) rendered as a screen-space overlay ---------- */
function BarHead({
  node, size, accent, active,
}: { node: MindNode; size: number; accent: string; active: boolean }) {
  const url = useResolvedImage(node);
  const nameSize = Math.max(12, Math.min(22, size * 0.14));
  return (
    <div className="flex flex-col items-center pointer-events-none select-none">
      {url ? (
        <div
          className="rounded-full overflow-hidden bg-muted"
          style={{
            width: size, height: size,
            border: `3px solid ${active ? accent : "rgba(255,255,255,0.35)"}`,
            boxShadow: active ? `0 8px 40px ${accent}aa` : "0 4px 18px rgba(0,0,0,0.35)",
            transition: "border-color 700ms ease, box-shadow 700ms ease",
          }}
        >
          <img src={url} alt="" className="size-full object-cover" />
        </div>
      ) : (
        <div
          className="rounded-full grid place-items-center bg-muted text-2xl font-black text-muted-foreground"
          style={{
            width: size, height: size,
            border: `3px solid ${active ? accent : "rgba(255,255,255,0.35)"}`,
          }}
        >{(node.text || "?").slice(0, 1).toUpperCase()}</div>
      )}
      <div
        className="mt-2 text-center font-semibold px-3 py-1 rounded-md backdrop-blur-sm"
        style={{
          fontSize: nameSize,
          color: "#fff",
          background: active ? `${accent}dd` : "rgba(0,0,0,0.55)",
          boxShadow: active ? `0 4px 20px ${accent}66` : undefined,
          maxWidth: Math.max(180, size * 1.8),
          transition: "background 700ms ease",
        }}
      >
        {node.text}
      </div>
    </div>
  );
}

/* ---------- 3D bar body (rendered inside the transformed stage) ---------- */
function Bar3D({
  node, hWorld, wWorld, color, accent, active,
}: {
  node: MindNode;
  hWorld: number;
  wWorld: number;
  color: string;
  accent: string;
  active: boolean;
}) {
  const depth = Math.max(18, Math.min(46, wWorld * 0.28));
  return (
    <div className="absolute bottom-0" style={{ width: wWorld + depth, height: hWorld, left: 0 }}>
      {/* Top face */}
      <div
        className="absolute"
        style={{
          left: depth, top: 0, width: wWorld, height: depth,
          transform: "skewX(-45deg)", transformOrigin: "left top",
          background: `linear-gradient(to bottom, ${mix(color, "#ffffff", 0.55)}, ${mix(color, "#ffffff", 0.25)})`,
          borderRadius: "4px 4px 0 0",
        }}
      />
      {/* Right side */}
      <div
        className="absolute"
        style={{
          left: depth + wWorld, top: depth, width: depth, height: hWorld - depth,
          transform: "skewY(-45deg)", transformOrigin: "left top",
          background: `linear-gradient(to right, ${mix(color, "#000000", 0.25)}, ${mix(color, "#000000", 0.55)})`,
        }}
      />
      {/* Front face */}
      <div
        className="absolute rounded-sm overflow-hidden"
        style={{
          left: depth, top: depth, width: wWorld, height: hWorld - depth,
          background: `linear-gradient(to bottom, ${mix(color, "#ffffff", 0.15)}, ${color} 55%, ${mix(color, "#000000", 0.25)})`,
          boxShadow: active
            ? `0 0 32px ${accent}bb, inset 0 0 0 2px ${accent}`
            : "inset 0 0 0 1px rgba(255,255,255,0.12)",
          transition: "box-shadow 700ms ease",
        }}
        aria-hidden
      />
    </div>
  );
}

/* ---------- frame with camera ---------- */
function ScaleFrame({
  size, items, config, focusIndex, isOverview, project,
}: {
  size: { w: number; h: number };
  items: MindNode[];
  config: ReturnType<typeof parseScaleConfig>;
  focusIndex: number | null;
  isOverview: boolean;
  project: Project;
}) {
  /* ----- world layout (real proportional heights) ----- */
  // Fixed reserved screen space (in px) at top for the bar head (image + name)
  // and at bottom for the ground line + shadow padding.
  const HEAD_SCREEN = 210;   // ~180 image + label + margin
  const GROUND_SCREEN = 60;

  const values = items.map((n) => Math.max(0, parseItemData(n.body).value));
  const positives = values.filter((v) => v > 0);
  const minPos = positives.length ? Math.min(...positives) : 1;
  const maxPos = positives.length ? Math.max(...positives) : 1;

  // Choose pxPerUnit so the SMALLEST positive bar has a nice base height in world units.
  // The camera later maps this to screen via `scale`. A world base of 400 gives the
  // smallest bar a comfortable 1:2 aspect at its focused scale.
  const BASE_WORLD_H = 400;
  const pxPerUnit = BASE_WORLD_H / (minPos || 1);

  const barWorldW = 200;                                          // fixed bar width in world
  const depth = Math.max(18, Math.min(46, barWorldW * 0.28));
  const gapWorld = 120;
  const cellW = barWorldW + depth + gapWorld;

  const heights = values.map((v) => (v > 0 ? v * pxPerUnit : 8));
  const maxWorldH = Math.max(BASE_WORLD_H, ...heights);

  const positions = items.map((_, i) => ({
    left: gapWorld / 2 + i * cellW,
    centerX: gapWorld / 2 + i * cellW + (barWorldW + depth) / 2,
  }));
  const totalWorldW = Math.max(cellW, gapWorld + items.length * cellW);

  // Stage has ground at its bottom; bars sit at bottom, image head lives above bar top.
  // Stage height in world coords equals maxWorldH (bars). Head is a screen overlay.

  /* ----- camera ----- */
  // Focus: scale so the focused bar's world height maps to (viewport.h - HEAD_SCREEN - GROUND_SCREEN).
  // Overview: fit tallest bar into that same band AND fit total width into ~90% viewport width.
  const usableH = Math.max(120, size.h - HEAD_SCREEN - GROUND_SCREEN);

  let scale: number;
  let translateX: number;
  const groundScreenY = size.h - GROUND_SCREEN;

  if (isOverview || focusIndex == null) {
    const scaleForH = usableH / maxWorldH;
    const scaleForW = (size.w * 0.9) / totalWorldW;
    scale = Math.min(scaleForH, scaleForW);
    translateX = (size.w - totalWorldW * scale) / 2;
  } else {
    const focusH = heights[focusIndex];
    scale = usableH / Math.max(focusH, 1);
    translateX = size.w / 2 - positions[focusIndex].centerX * scale;
  }

  // Stage transform: place ground line at groundScreenY. Stage top is at
  // groundScreenY - maxWorldH*scale (may be off-screen for tall bars — intentional).
  const stageTopScreen = groundScreenY - maxWorldH * scale;
  const stageWidthScreen = totalWorldW * scale;

  /* ----- helpers to project world coords → screen ----- */
  function worldToScreen(worldX: number, worldYFromGround: number) {
    // worldYFromGround measured upward from ground (0 = ground)
    return {
      x: translateX + worldX * scale,
      y: groundScreenY - worldYFromGround * scale,
    };
  }

  const focusNode = focusIndex != null ? items[focusIndex] : null;
  const focusData = focusNode ? parseItemData(focusNode.body) : null;
  const focusRatioLabel = focusIndex != null && focusIndex > 0
    ? (() => {
        // Compare to previous bar for context ("X vezes a de Y")
        const prev = items[focusIndex - 1];
        const prevV = parseItemData(prev.body).value;
        const cur = parseItemData(items[focusIndex].body).value;
        if (!prevV || !cur || prevV <= 0) return null;
        const times = cur / prevV;
        if (!Number.isFinite(times) || times <= 1.05) return null;
        return { times, prevName: prev.text || "anterior" };
      })()
    : null;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Sky / floor gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 80% at 50% 0%, ${mix(config.accentColor, "#0b1220", 0.85)} 0%, #0b1220 60%),
                       linear-gradient(to bottom, #0b1220 0%, #0b1220 55%, ${mix(config.barColor, "#000000", 0.6)} 100%)`,
        }}
      />

      {/* Ground line — stays fixed at the frame's bottom band */}
      <div
        className="absolute inset-x-0"
        style={{
          top: groundScreenY,
          height: 1,
          background: "rgba(255,255,255,0.18)",
          boxShadow: "0 0 40px rgba(255,255,255,0.08)",
        }}
      />

      {/* Camera stage: bars only */}
      <div
        className="absolute"
        style={{
          left: translateX,
          top: stageTopScreen,
          width: stageWidthScreen,
          height: maxWorldH * scale,
          transition: "left 1600ms cubic-bezier(0.65, 0, 0.35, 1), top 1600ms cubic-bezier(0.65, 0, 0.35, 1), width 1600ms cubic-bezier(0.65, 0, 0.35, 1), height 1600ms cubic-bezier(0.65, 0, 0.35, 1)",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "0 100%",
            transition: "transform 1600ms cubic-bezier(0.65, 0, 0.35, 1)",
            width: totalWorldW,
            height: maxWorldH,
          }}
        >
          {items.map((n, i) => {
            const hWorld = heights[i];
            const isActive = focusIndex === i;
            const dim = focusIndex != null && !isActive;
            return (
              <div
                key={n.id}
                className="absolute bottom-0"
                style={{
                  left: positions[i].left,
                  width: barWorldW + depth,
                  height: hWorld,
                  opacity: dim ? 0.5 : 1,
                  transition: "opacity 700ms ease",
                }}
              >
                <Bar3D
                  node={n}
                  hWorld={hWorld}
                  wWorld={barWorldW}
                  color={n.color ?? config.barColor}
                  accent={config.accentColor}
                  active={isActive}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Bar heads — screen-space overlays that ride the top of each bar.
          Because they live outside the transformed stage, image & label stay
          readable at any zoom level. */}
      {items.map((n, i) => {
        const isActive = focusIndex === i;
        const dim = focusIndex != null && !isActive;
        // Anchor: horizontal center of the bar (accounting for depth), top of the bar in world.
        const anchorWorldX = positions[i].left + (barWorldW + depth) / 2;
        const anchorWorldY = heights[i]; // from ground upward
        const p = worldToScreen(anchorWorldX, anchorWorldY);
        const headSize = isActive ? 168 : 116;
        // Push head above the bar top by a small screen gap.
        const gapAboveBar = 14;
        return (
          <div
            key={`head-${n.id}`}
            className="absolute"
            style={{
              left: p.x,
              top: p.y - gapAboveBar,
              transform: "translate(-50%, -100%)",
              opacity: dim ? 0.35 : 1,
              transition: "left 1600ms cubic-bezier(0.65, 0, 0.35, 1), top 1600ms cubic-bezier(0.65, 0, 0.35, 1), opacity 700ms ease",
              zIndex: isActive ? 5 : 2,
            }}
          >
            <BarHead
              node={n}
              size={headSize}
              accent={config.accentColor}
              active={isActive}
            />
          </div>
        );
      })}

      {/* Focus card (name + value + unit + note) — bottom-left overlay */}
      {focusNode && focusData && (
        <div
          key={focusNode.id}
          className="absolute left-8 bottom-24 max-w-[42%] p-5 rounded-2xl border-2 backdrop-blur-md bg-black/50 animate-fade-in"
          style={{
            borderColor: config.accentColor,
            boxShadow: `0 20px 60px ${config.accentColor}44`,
          }}
        >
          <div className="text-[11px] uppercase tracking-widest opacity-80" style={{ color: config.accentColor }}>
            Comparação em escala real
          </div>
          <div className="text-3xl md:text-4xl font-black leading-tight text-white mt-1">
            {focusNode.text}
          </div>
          <div className="mt-2 text-white">
            <span className="text-4xl md:text-5xl font-black" style={{ color: config.accentColor }}>
              {formatValue(focusData.value)}
            </span>
            <span className="ml-2 text-lg opacity-90">{focusData.unit || config.unit}</span>
          </div>
          {focusRatioLabel && (
            <div className="mt-2 text-sm text-white/85">
              ≈ <b>{focusRatioLabel.times.toLocaleString("pt-BR", { maximumFractionDigits: focusRatioLabel.times >= 10 ? 0 : 1 })}×</b> a de <i>{focusRatioLabel.prevName}</i>
            </div>
          )}
          {focusData.note && (
            <p className="mt-3 text-sm md:text-base text-white/85 leading-relaxed whitespace-pre-wrap">
              {focusData.note}
            </p>
          )}
        </div>
      )}

      {/* Overview caption */}
      {isOverview && (
        <div className="absolute inset-x-0 top-8 flex justify-center pointer-events-none">
          <div className="px-5 py-2 rounded-full bg-black/40 backdrop-blur text-white text-sm md:text-base border border-white/10">
            {config.caption || "Uma comparação em escala."}
          </div>
        </div>
      )}

      <AvatarLayer project={project} frameSize={size} />
    </div>
  );
}
