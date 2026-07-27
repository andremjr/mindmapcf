import { useLayoutEffect, useRef, useState } from "react";
import { AutoFitText } from "./AutoFitText";

/**
 * Shared layout for text-only cards (tier list items, spotlights).
 *
 * Splits the card into two independently auto-fit bands:
 *   • TITLE band on top  (bold, big)
 *   • BODY  band below   (regular, wraps up to `clampBody` lines)
 *
 * The title band takes a share of the height that adapts to the card's
 * aspect ratio, so a horizontal card doesn't waste half its width on a
 * tiny centered word, and a vertical card gets a proper title-over-story
 * rhythm. Each band uses its own AutoFitText so they can each fill their
 * region — instead of shrinking the whole block until the smallest line
 * fits, which used to make text disappear on long descriptions.
 */
export function TextCardBody({
  title,
  body,
  max,
  min = 5,
  scale = "sm",
  deps = "",
  tone = "light",
  clampBody = 6,
}: {
  title: string;
  body?: string | null;
  /** Kept for API compat; used as a soft ceiling for the title band font. */
  max: number;
  min?: number;
  /** sm = card sized, lg = spotlight sized (affects paddings). */
  scale?: "sm" | "lg";
  deps?: string | number;
  tone?: "light" | "muted";
  /** Max lines for the description; overflow is trimmed with ellipsis. */
  clampBody?: number;
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

  const hasBody = !!(body && body.trim());
  const bodyColor = tone === "muted" ? "text-muted-foreground" : "text-white/80";
  const ruleColor = tone === "muted" ? "bg-foreground/25" : "bg-white/40";

  // Title band share of vertical space, biased by aspect ratio:
  //   very wide (aspect > 1.6) → title takes ~50% (headline over subtitle)
  //   square (~1)             → title ~42%
  //   tall (aspect < 0.7)     → title ~34% (leaves room for the story)
  const titleShare = hasBody
    ? Math.max(0.3, Math.min(0.55, 0.42 + (aspect - 1) * 0.12))
    : 1;

  const padClass = scale === "lg" ? "p-[6%]" : "p-[7%]";
  const gapPct = scale === "lg" ? 4 : 5; // % of height used as gap between bands
  const titleMax = Math.round(max * (scale === "lg" ? 1 : 1.15));
  const bodyMax = Math.round(max * (scale === "lg" ? 0.55 : 0.62));

  return (
    <div ref={rootRef} className={`absolute inset-0 flex flex-col ${padClass}`}>
      {/* Title band */}
      <div
        className="relative flex items-center justify-center text-center"
        style={{ flex: `${titleShare} 1 0`, minHeight: 0 }}
      >
        <AutoFitText
          className="absolute inset-0 grid place-items-center"
          max={titleMax}
          min={min}
          deps={`t|${titleShare.toFixed(2)}|${deps}`}
        >
          <div
            className="font-bold break-words whitespace-normal"
            style={{ lineHeight: 1.1, letterSpacing: "-0.015em" }}
          >
            {title || "Item"}
          </div>
        </AutoFitText>
      </div>

      {hasBody ? (
        <>
          {/* Divider + gap */}
          <div
            className="flex items-center justify-center"
            style={{ height: `${gapPct}%` }}
          >
            <div
              className={`${ruleColor} rounded-full`}
              style={{ width: "22%", height: 2, maxHeight: "0.12em" }}
            />
          </div>

          {/* Body band */}
          <div
            className="relative flex items-center justify-center text-center"
            style={{ flex: `${1 - titleShare} 1 0`, minHeight: 0 }}
          >
            <AutoFitText
              className="absolute inset-0 grid place-items-center"
              max={bodyMax}
              min={min}
              deps={`b|${titleShare.toFixed(2)}|${deps}`}
            >
              <div
                className={`${bodyColor} break-words whitespace-normal`}
                style={{
                  lineHeight: 1.3,
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical" as const,
                  WebkitLineClamp: clampBody,
                  overflow: "hidden",
                }}
              >
                {body}
              </div>
            </AutoFitText>
          </div>
        </>
      ) : null}
    </div>
  );
}
