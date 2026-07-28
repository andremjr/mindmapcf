import { useLayoutEffect, useRef, useState } from "react";
import { AutoFitText } from "./AutoFitText";

/**
 * Tier-list "open view" card (spotlight before placement).
 *
 * Layout follows the user's sketch: two stacked rounded bands with a small
 * gap between them — a compact TITLE band on top and a large CONTENT band
 * below. Works for the three item aspects (vertical, horizontal, square).
 *
 *   ┌──────────────────┐
 *   │      TITLE       │  ← compact band, auto-fit text
 *   ├──────────────────┤
 *   │                  │
 *   │     CONTENT      │  ← media (image/video) OR body text (auto-fit)
 *   │                  │
 *   └──────────────────┘
 *
 * Text always fits without cuts or scroll — AutoFitText shrinks font size to
 * the available box.
 */
export function SpotlightCard({
  title,
  body,
  mediaUrl,
  mediaKind = "image",
  color,
  max = 72,
  min = 10,
  deps = "",
}: {
  title: string;
  body?: string | null;
  mediaUrl?: string | null;
  mediaKind?: "image" | "video";
  color?: string | null;
  max?: number;
  min?: number;
  deps?: string | number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1, h: 1, aspect: 1 });

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setBox({ w: r.width, h: r.height, aspect: r.width / r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasTitle = !!title?.trim();
  const hasBody = !!body?.trim();
  const aspect = box.aspect;

  // Title band takes a small, aspect-aware slice of the height.
  //   horizontal (aspect > 1.4) → ~22%
  //   square (~1)               → ~18%
  //   vertical (aspect < 0.75)  → ~14%
  const titleShare = hasTitle
    ? Math.max(0.12, Math.min(0.24, 0.18 + (aspect - 1) * 0.05))
    : 0;

  const gapPct = 2.4; // % of card height between the two bands
  const outerPadPct = 3.2;
  const availableH = box.h * (1 - outerPadPct * 2 / 100);
  const titlePx = hasTitle ? availableH * titleShare : 0;
  const contentPx = Math.max(1, availableH - titlePx - (hasTitle ? box.h * gapPct / 100 : 0));
  const contentW = Math.max(1, box.w * (1 - outerPadPct * 2 / 100));
  const titleMax = Math.min(180, Math.max(max, Math.round(Math.min(contentW, titlePx) * 0.72)));
  const bodyMax = Math.min(260, Math.max(max, Math.round(Math.min(contentW, contentPx) * 0.55)));

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 flex flex-col"
      style={{ background: color ?? "#111", padding: `${outerPadPct}%`, gap: `${gapPct}%` }}
    >
      {hasTitle && (
        <div
          className="relative rounded-2xl bg-black/45 border border-white/15 overflow-hidden"
          style={{ flex: `${titleShare} 1 0`, minHeight: 0 }}
        >
          <div className="absolute inset-0" style={{ padding: "2.2% 4.8%" }}>
            <AutoFitText
              className="grid h-full w-full place-items-center"
              max={titleMax}
              min={min}
              deps={`t|${box.w.toFixed(0)}x${box.h.toFixed(0)}|${deps}`}
            >
              <div
                className="text-white font-bold text-center break-words whitespace-normal"
                style={{ lineHeight: 1.1, letterSpacing: "-0.015em" }}
              >
                {title}
              </div>
            </AutoFitText>
          </div>
        </div>
      )}

      <div
        className="relative rounded-2xl bg-black/45 border border-white/15 overflow-hidden"
        style={{ flex: `${1 - titleShare} 1 0`, minHeight: 0 }}
      >
        {mediaUrl ? (
          mediaKind === "video" ? (
            <video src={mediaUrl} autoPlay muted loop playsInline className="absolute inset-0 size-full object-cover" />
          ) : (
            <img src={mediaUrl} alt="" className="absolute inset-0 size-full object-cover" />
          )
        ) : hasBody ? (
          <div className="absolute inset-0" style={{ padding: "1.6% 4%" }}>
            <AutoFitText
              className="grid h-full w-full items-start justify-stretch"
              max={bodyMax}
              min={min}
              deps={`b|${box.w.toFixed(0)}x${box.h.toFixed(0)}|${deps}`}
            >
              <div
                className="text-white/90 text-left break-words"
                style={{ lineHeight: 1.3, whiteSpace: "pre-wrap" }}
              >
                {body}
              </div>
            </AutoFitText>
          </div>
        ) : null}
      </div>
    </div>
  );
}
