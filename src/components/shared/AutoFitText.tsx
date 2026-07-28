import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Shrinks its content's font-size until it fits the parent box.
 * Used by text-only cards (tier list) where the title + description must stay
 * fully readable no matter how long the text is.
 */
export function AutoFitText({
  children,
  max = 14,
  min = 5,
  className = "",
  deps = "",
}: {
  children: ReactNode;
  /** Starting (largest) font size in px. */
  max?: number;
  /** Smallest allowed font size in px. */
  min?: number;
  className?: string;
  /** Extra value that, when changed, forces a re-measure. */
  deps?: string | number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(max);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;

    const fit = () => {
      const boxW = box.clientWidth;
      const boxH = box.clientHeight;
      if (boxW <= 0 || boxH <= 0) return;

      let lo = min;
      let hi = max;
      let best = min;
      // Binary search the largest size that fits both axes.
      for (let i = 0; i < 9 && lo <= hi; i++) {
        const mid = (lo + hi) / 2;
        inner.style.fontSize = `${mid}px`;
        inner.style.width = `${boxW}px`;
        const fits =
          inner.scrollHeight <= boxH + 0.5 &&
          inner.scrollWidth <= boxW + 0.5;
        if (fits) {
          best = mid;
          lo = mid + 0.25;
        } else {
          hi = mid - 0.25;
        }
      }
      inner.style.fontSize = "";
      inner.style.width = "";
      setSize(best);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [max, min, deps]);

  return (
    <div ref={boxRef} className={`overflow-hidden ${className}`}>
      <div ref={innerRef} style={{ fontSize: size, lineHeight: 1.25, width: "100%" }}>
        {children}
      </div>
    </div>
  );
}
