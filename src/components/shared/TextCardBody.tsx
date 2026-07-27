import { AutoFitText } from "./AutoFitText";

/**
 * Shared layout for text-only cards (tier list items, spotlights).
 * Keeps a consistent rhythm: padded box, bold title, hairline rule, then the
 * description — instead of two blocks of text glued together in the middle.
 */
export function TextCardBody({
  title,
  body,
  max,
  min = 5,
  scale = "sm",
  deps = "",
  tone = "light",
  clampBody,
}: {
  title: string;
  body?: string | null;
  max: number;
  min?: number;
  /** sm = card sized, lg = spotlight sized (affects spacing ratios). */
  scale?: "sm" | "lg";
  deps?: string | number;
  tone?: "light" | "muted";
  /** Max lines for the description; extra text is trimmed instead of shrinking the whole card. */
  clampBody?: number;
}) {
  const pad = scale === "lg" ? "px-[8%] py-[6%]" : "px-[6%] py-[5%]";
  const gap = scale === "lg" ? "0.55em" : "0.4em";
  const bodyColor = tone === "muted" ? "text-muted-foreground" : "text-white/75";
  const ruleColor = tone === "muted" ? "bg-foreground/20" : "bg-white/35";

  return (
    <AutoFitText
      className={`absolute inset-0 grid place-items-center text-center ${pad}`}
      max={max}
      min={min}
      deps={deps}
    >
      <div className="flex flex-col items-center" style={{ gap }}>
        <div
          className="font-bold break-words whitespace-normal"
          style={{ lineHeight: 1.15, letterSpacing: "-0.01em" }}
        >
          {title || "Item"}
        </div>
        {body ? (
          <>
            <div className={`${ruleColor} rounded-full`} style={{ width: "2.2em", height: "0.09em" }} />
            <div
              className={`${bodyColor} break-words whitespace-normal`}
              style={{
                fontSize: scale === "lg" ? "0.6em" : "0.74em",
                lineHeight: 1.35,
                maxWidth: "34em",
                ...(clampBody
                  ? {
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical" as const,
                      WebkitLineClamp: clampBody,
                      overflow: "hidden",
                    }
                  : {}),
              }}
            >
              {body}
            </div>
          </>
        ) : null}
      </div>
    </AutoFitText>
  );
}
