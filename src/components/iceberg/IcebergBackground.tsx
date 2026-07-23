/**
 * Decorative background art for the iceberg canvas. Renders a soft iceberg
 * silhouette spanning the full column plus a school of fish drifting across
 * every level. Deeper levels use bioluminescent "anglerfish" dots.
 *
 * All layers use very low opacity and pointer-events-none so they never
 * interfere with item interactions on top.
 */
export function IcebergBackground({ levels }: { levels: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes fish-drift-r { from { transform: translateX(-15%); } to { transform: translateX(115%); } }
        @keyframes fish-drift-l { from { transform: translateX(115%) scaleX(-1); } to { transform: translateX(-15%) scaleX(-1); } }
        @keyframes anglerfish-glow { 0%,100% { opacity: 0.35; filter: blur(1px); } 50% { opacity: 0.9; filter: blur(2px); } }
        @keyframes iceberg-shimmer { 0%,100% { opacity: 0.10; } 50% { opacity: 0.18; } }
      `}</style>

      {/* Iceberg silhouette — spans the whole height so it "descends" through
          every level. Very low opacity so items stay readable. */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ animation: "iceberg-shimmer 9s ease-in-out infinite" }}
      >
        <defs>
          <linearGradient id="ice-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.9" />
            <stop offset="35%" stopColor="#bae6fd" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#0c1e3a" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        {/* Above-water crown (top ~15%) + big underwater body */}
        <polygon
          points="42,4 58,7 68,13 62,18 74,20 30,20 36,15"
          fill="url(#ice-grad)"
          opacity="0.55"
        />
        <polygon
          points="30,20 74,20 88,45 80,72 55,96 24,88 14,60 20,32"
          fill="url(#ice-grad)"
          opacity="0.35"
        />
        {/* Faint cracks */}
        <path d="M40 22 L46 55 L42 90" stroke="#fff" strokeOpacity="0.15" strokeWidth="0.2" fill="none" />
        <path d="M60 22 L58 50 L64 85" stroke="#fff" strokeOpacity="0.15" strokeWidth="0.2" fill="none" />
      </svg>

      {/* Fish per level. Only for underwater levels (i>=1). */}
      {Array.from({ length: Math.max(0, levels - 1) }).map((_, i) => {
        const levelIdx = i + 1;
        const deep = levelIdx >= Math.max(2, Math.floor(levels * 0.6));
        const topPct = (levelIdx + 0.5) / levels * 100;
        return (
          <div
            key={i}
            className="absolute left-0 right-0"
            style={{ top: `${topPct}%`, height: 0 }}
          >
            <Fish variant={deep ? "angler" : "normal"} delay={0} duration={38 + i * 4} depthIdx={levelIdx} direction="r" offset={-40} />
            <Fish variant={deep ? "angler" : "normal"} delay={12} duration={44 + i * 3} depthIdx={levelIdx} direction="l" offset={30} />
            {deep && (
              <Fish variant="angler" delay={22} duration={52} depthIdx={levelIdx} direction="r" offset={70} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Fish({
  variant,
  delay,
  duration,
  depthIdx,
  direction,
  offset,
}: {
  variant: "normal" | "angler";
  delay: number;
  duration: number;
  depthIdx: number;
  direction: "l" | "r";
  offset: number;
}) {
  const size = variant === "angler" ? 30 : 22 + (depthIdx % 3) * 4;
  const opacity = variant === "angler" ? 0.35 : 0.22;
  const anim = direction === "r" ? "fish-drift-r" : "fish-drift-l";
  return (
    <div
      className="absolute"
      style={{
        top: offset,
        left: 0,
        width: "100%",
        opacity,
      }}
    >
      <div
        style={{
          width: size,
          height: size * 0.55,
          animation: `${anim} ${duration}s linear ${delay}s infinite`,
        }}
      >
        {variant === "normal" ? (
          <svg viewBox="0 0 32 18" width={size} height={size * 0.55}>
            <path d="M2 9 Q10 -1 22 3 Q28 9 22 15 Q10 19 2 9 Z" fill="#e2e8f0" />
            <polygon points="22,3 30,0 26,9 30,18 22,15" fill="#cbd5e1" />
            <circle cx="10" cy="7" r="1" fill="#0f172a" />
          </svg>
        ) : (
          <div className="relative">
            <svg viewBox="0 0 40 20" width={size} height={size * 0.55}>
              <path d="M4 10 Q14 -1 30 4 Q36 10 30 16 Q14 21 4 10 Z" fill="#1e293b" />
              <polygon points="30,4 40,0 34,10 40,20 30,16" fill="#0f172a" />
              <circle cx="14" cy="7" r="1.2" fill="#facc15" />
              {/* Lure rod */}
              <path d="M8 6 Q4 -2 12 -4" stroke="#334155" strokeWidth="0.6" fill="none" />
            </svg>
            <span
              className="absolute rounded-full"
              style={{
                left: size * 0.28,
                top: -size * 0.28,
                width: size * 0.18,
                height: size * 0.18,
                background: "radial-gradient(circle, #fde68a, #f59e0b 60%, transparent 70%)",
                animation: "anglerfish-glow 2.2s ease-in-out infinite",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
