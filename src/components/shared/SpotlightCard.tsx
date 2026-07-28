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
  const [aspect, setAspect] = useState(1);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setAspect(r.width / r.height);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasTitle = !!title?.trim();
  const hasBody = !!body?.trim();

  // Title band takes a small, aspect-aware slice of the height.
  //   horizontal (aspect > 1.4) → ~22%
  //   square (~1)               → ~18%
  //   vertical (aspect < 0.75)  → ~14%
  const titleShare = hasTitle
    ? Math.max(0.12, Math.min(0.24, 0.18 + (aspect - 1) * 0.05))
    : 0;

  const gapPct = 3; // % of card height between the two bands
  const outerPadPct = 4;

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
          <div className="absolute inset-0" style={{ padding: "3% 5%" }}>
            <AutoFitText
              className="absolute inset-0 grid place-items-center"
              max={Math.round(max * 0.9)}
              min={min}
              deps={`t|${aspect.toFixed(2)}|${deps}`}
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
          <div className="absolute inset-0" style={{ padding: "3% 3.5%" }}>
            <AutoFitText
              className="absolute inset-0 grid place-items-center"
              max={Math.round(max * 1.1)}
              min={min}
              deps={`b|${aspect.toFixed(2)}|${deps}`}
            >
              <div
                className="text-white/90 text-center break-words whitespace-normal"
                style={{ lineHeight: 1.3 }}
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
