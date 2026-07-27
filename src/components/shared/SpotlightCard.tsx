import { useLayoutEffect, useRef, useState } from "react";
import { AutoFitText } from "./AutoFitText";
import { TextCardBody } from "./TextCardBody";

/**
 * Card used in the tier-list "open view" (before an item is placed).
 *
 * Layout rules requested by the user:
 *   • With media (image/video) + text  → media on TOP band, title + body on
 *     the BOTTOM band, both fully visible (no line-clamp, no scroll).
 *     Fonts shrink via AutoFitText so nothing gets cut.
 *   • Media only                       → media fills the card.
 *   • Text only                        → TextCardBody (title band + body band).
 *
 * The media/text split adapts to the card's aspect ratio so wide cards keep
 * the media dominant and tall cards give room to the description.
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

  const hasText = !!(title?.trim() || body?.trim());
  const hasBody = !!body?.trim();

  // Text-only → delegate to TextCardBody with no clamp so nothing is cut.
  if (!mediaUrl) {
    return (
      <div ref={rootRef} className="absolute inset-0 text-white" style={{ background: color ?? undefined }}>
        <TextCardBody
          title={title}
          body={body}
          max={max}
          min={min}
          scale="lg"
          clampBody={999}
          deps={deps}
        />
      </div>
    );
  }

  // Media-only → fill.
  if (!hasText) {
    return (
      <div ref={rootRef} className="absolute inset-0" style={{ background: color ?? "#111" }}>
        {mediaKind === "video" ? (
          <video src={mediaUrl} autoPlay muted loop playsInline className="absolute inset-0 size-full object-cover" />
        ) : (
          <img src={mediaUrl} alt="" className="absolute inset-0 size-full object-cover" />
        )}
      </div>
    );
  }

  // Media + text → split into two vertical bands.
  // Wider cards → media dominant; taller cards → give more room to the text.
  const mediaShare = Math.max(0.45, Math.min(0.72, 0.6 + (aspect - 1) * 0.08));
  const textShare = 1 - mediaShare;
  const titleShare = hasBody ? 0.32 : 1;

  return (
    <div ref={rootRef} className="absolute inset-0 flex flex-col" style={{ background: color ?? "#111" }}>
      {/* Media band */}
      <div className="relative w-full overflow-hidden" style={{ flex: `${mediaShare} 1 0`, minHeight: 0 }}>
        {mediaKind === "video" ? (
          <video src={mediaUrl} autoPlay muted loop playsInline className="absolute inset-0 size-full object-cover" />
        ) : (
          <img src={mediaUrl} alt="" className="absolute inset-0 size-full object-cover" />
        )}
      </div>

      {/* Text band */}
      <div
        className="relative w-full flex flex-col text-white"
        style={{ flex: `${textShare} 1 0`, minHeight: 0, padding: "4% 5%" }}
      >
        <div
          className="relative flex items-center justify-center text-center"
          style={{ flex: `${titleShare} 1 0`, minHeight: 0 }}
        >
          <AutoFitText
            className="absolute inset-0 grid place-items-center"
            max={Math.round(max * 0.9)}
            min={min}
            deps={`t|${aspect.toFixed(2)}|${deps}`}
          >
            <div
              className="font-bold break-words whitespace-normal"
              style={{ lineHeight: 1.1, letterSpacing: "-0.015em" }}
            >
              {title || "Item"}
            </div>
          </AutoFitText>
        </div>

        {hasBody && (
          <>
            <div className="flex items-center justify-center" style={{ height: "4%" }}>
              <div className="bg-white/40 rounded-full" style={{ width: "18%", height: 2, maxHeight: "0.12em" }} />
            </div>
            <div
              className="relative flex items-center justify-center text-center"
              style={{ flex: `${1 - titleShare} 1 0`, minHeight: 0 }}
            >
              <AutoFitText
                className="absolute inset-0 grid place-items-center"
                max={Math.round(max * 0.55)}
                min={min}
                deps={`b|${aspect.toFixed(2)}|${deps}`}
              >
                <div
                  className="text-white/85 break-words whitespace-normal"
                  style={{ lineHeight: 1.3 }}
                >
                  {body}
                </div>
              </AutoFitText>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
