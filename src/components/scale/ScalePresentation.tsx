import { useEffect, useMemo, useRef, useState } from "react";
import type { MindNode, Project } from "@/lib/types";
import { resolveImage } from "@/lib/imageStorage";
import { useStore } from "@/lib/store";
import { PresentationShell } from "@/components/shared/PresentationShell";
import { AvatarLayer } from "@/components/shared/AvatarLayer";
import {
  formatValue, heightRatio, parseItemData, parseScaleConfig,
} from "@/lib/scaleConfig";
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

/* ---------- 3D bar (presentation) ---------- */
function Bar3D({
  node, height, width, color, accent, active,
}: {
  node: MindNode;
  height: number; // px
  width: number;  // px
  color: string;
  accent: string;
  active: boolean;
}) {
  const url = useResolvedImage(node);
  const depth = Math.max(18, Math.min(46, width * 0.28));
  const imgSize = Math.min(width * 0.9, 140);

  return (
    <div className="relative flex flex-col items-center" style={{ width: width + depth }}>
      {/* Image + name above the bar (top of the bar) */}
      <div
        className="flex flex-col items-center transition-all duration-700"
        style={{
          transform: active ? "translateY(-6px) scale(1.04)" : "translateY(0)",
          opacity: active ? 1 : 0.85,
        }}
      >
        {url ? (
          <div
            className="rounded-full overflow-hidden bg-muted shadow-xl mb-2"
            style={{
              width: imgSize,
              height: imgSize,
              border: `3px solid ${active ? accent : "rgba(255,255,255,0.35)"}`,
              boxShadow: active ? `0 8px 40px ${accent}88` : "0 4px 18px rgba(0,0,0,0.35)",
            }}
          >
            <img src={url} alt="" className="size-full object-cover" />
          </div>
        ) : (
          <div
            className="rounded-full grid place-items-center bg-muted mb-2 text-2xl font-black text-muted-foreground"
            style={{
              width: imgSize, height: imgSize,
              border: `3px solid ${active ? accent : "rgba(255,255,255,0.35)"}`,
            }}
          >{(node.text || "?").slice(0, 1).toUpperCase()}</div>
        )}
        <div
          className="text-center font-semibold px-3 py-1 rounded-md backdrop-blur-sm"
          style={{
            fontSize: Math.max(14, Math.min(22, width * 0.16)),
            color: "#fff",
            background: active ? `${accent}dd` : "rgba(0,0,0,0.45)",
            boxShadow: active ? `0 4px 20px ${accent}66` : undefined,
            maxWidth: width + depth + 40,
          }}
        >
          {node.text}
        </div>
      </div>

      {/* Bar itself (with 3D faces) */}
      <div className="relative mt-2" style={{ width: width + depth, height }}>
        {/* Top face */}
        <div
          className="absolute"
          style={{
            left: depth, top: 0, width, height: depth,
            transform: "skewX(-45deg)", transformOrigin: "left top",
            background: `linear-gradient(to bottom, ${mix(color, "#ffffff", 0.55)}, ${mix(color, "#ffffff", 0.25)})`,
            borderRadius: "4px 4px 0 0",
          }}
        />
        {/* Right side */}
        <div
          className="absolute"
          style={{
            left: depth + width, top: depth, width: depth, height: height - depth,
            transform: "skewY(-45deg)", transformOrigin: "left top",
            background: `linear-gradient(to right, ${mix(color, "#000000", 0.25)}, ${mix(color, "#000000", 0.55)})`,
          }}
        />
        {/* Front face */}
        <div
          className="absolute rounded-sm overflow-hidden"
          style={{
            left: depth, top: depth, width, height: height - depth,
            background: `linear-gradient(to bottom, ${mix(color, "#ffffff", 0.15)}, ${color} 55%, ${mix(color, "#000000", 0.25)})`,
            boxShadow: active
              ? `0 0 32px ${accent}bb, inset 0 0 0 2px ${accent}`
              : "inset 0 0 0 1px rgba(255,255,255,0.12)",
            transition: "box-shadow 700ms ease",
          }}
        >
          {/* Value label engraved on the front face when tall enough */}
          {height > 90 && (
            <div
              className="absolute inset-x-0 bottom-3 text-center font-black tracking-tight"
              style={{
                color: "rgba(255,255,255,0.95)",
                fontSize: Math.max(14, Math.min(28, width * 0.2)),
                textShadow: "0 2px 8px rgba(0,0,0,0.6)",
              }}
            >
              {formatValue(parseItemData(node.body).value)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- steps ---------- */
type Step =
  | { kind: "overview" }
  | { kind: "focus"; index: number };

/* ================================================================= */
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
  const values = items.map((n) => parseItemData(n.body).value);
  const gap = Math.max(24, Math.min(80, size.w * 0.03));
  const maxBars = items.length || 1;
  // Bar width auto-scales so all fit; capped for readability.
  const availableW = size.w - gap * (maxBars + 1);
  const barW = Math.max(60, Math.min(180, availableW / maxBars));
  const maxBarH = size.h * 0.6;

  const focusNode = focusIndex != null ? items[focusIndex] : null;
  const focusData = focusNode ? parseItemData(focusNode.body) : null;

  // Build positions once per layout so camera can target them.
  const layout = useMemo(() => {
    const positions: Array<{ x: number; barH: number; w: number }> = [];
    let cursor = gap;
    items.forEach((n) => {
      const ratio = heightRatio(parseItemData(n.body).value, values, config.scaleMode);
      const barH = Math.max(60, Math.round(ratio * maxBarH));
      const depth = Math.max(18, Math.min(46, barW * 0.28));
      positions.push({ x: cursor + (barW + depth) / 2, barH, w: barW });
      cursor += barW + depth + gap;
    });
    const totalW = cursor;
    return { positions, totalW };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, size.w, size.h, config.scaleMode, config.sortMode]);

  // Camera: translate+scale a stage sized to `totalW`.
  const overviewScale = Math.min(1, (size.w - 40) / Math.max(layout.totalW, 1));
  const focusPos = focusIndex != null ? layout.positions[focusIndex] : null;
  const targetScale = isOverview ? overviewScale : Math.min(2.4, Math.max(1.2, size.w / (focusPos!.w * 5)));
  const stageWorldH = maxBarH + 260; // room for the head (image + name) above bar

  const translateX = isOverview
    ? (size.w - layout.totalW * overviewScale) / 2
    : (size.w / 2 - focusPos!.x * targetScale);
  // For focus, push the stage down a bit so the top of the bar (image + name)
  // sits comfortably above the center of the frame.
  const translateY = isOverview
    ? (size.h - stageWorldH * overviewScale) / 2 - 20
    : (size.h * 0.55 - (stageWorldH - focusPos!.barH - 260 / 2) * targetScale);

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
      {/* Ground line */}
      <div
        className="absolute inset-x-0"
        style={{
          bottom: `${(size.h - (translateY + stageWorldH * targetScale)) / size.h * 100}%`,
          height: 1, background: "rgba(255,255,255,0.15)",
        }}
      />

      {/* Camera stage */}
      <div
        className="absolute top-0 left-0"
        style={{
          transform: `translate(${translateX}px, ${translateY}px) scale(${targetScale})`,
          transformOrigin: "0 0",
          transition: "transform 1600ms cubic-bezier(0.65, 0, 0.35, 1)",
          width: layout.totalW,
          height: stageWorldH,
        }}
      >
        {/* Bars row aligned to the ground */}
        <div className="absolute inset-x-0 bottom-0 flex items-end" style={{ gap }}>
          <div style={{ width: gap - gap }} />
          {items.map((n, i) => {
            const barH = layout.positions[i]?.barH ?? 80;
            const isActive = focusIndex === i;
            const dim = focusIndex != null && !isActive;
            return (
              <div key={n.id}
                className="transition-opacity duration-700"
                style={{ opacity: dim ? 0.35 : 1 }}
              >
                <Bar3D
                  node={n}
                  height={barH + 260}   /* space reserved above bar for head */
                  width={barW}
                  color={n.color ?? config.barColor}
                  accent={config.accentColor}
                  active={isActive}
                />
              </div>
            );
          })}
          <div style={{ width: gap - gap }} />
        </div>
      </div>

      {/* Focus card (name + value + unit + note) — bottom-left overlay */}
      {focusNode && focusData && (
        <div
          key={focusNode.id}
          className="absolute left-8 bottom-8 max-w-[42%] p-5 rounded-2xl border-2 backdrop-blur-md bg-black/50 animate-fade-in"
          style={{
            borderColor: config.accentColor,
            boxShadow: `0 20px 60px ${config.accentColor}44`,
          }}
        >
          <div className="text-[11px] uppercase tracking-widest opacity-80" style={{ color: config.accentColor }}>
            Comparação em escala
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

      <AvatarLayer
        project={project}
        frameSize={size}
      />
    </div>
  );
}
