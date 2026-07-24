/**
 * "Realista" atmosphere for iceberg — moody, high-contrast, documentary look
 * suited to unsettling/limit topics. A single ominous iceberg silhouette
 * spans the full column with jagged, cracked geometry; deep-sea creatures
 * drift by as heavy silhouettes. Top level shows DARK creatures over the
 * pale-water surface; deeper levels shift to LIGHT creatures over the
 * abyss — always translucent so text stays king.
 */
function seeded(k: string) {
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) h = ((h ^ k.charCodeAt(i)) * 16777619) >>> 0;
  return (h % 1000) / 1000;
}

export function IcebergBackgroundRealista({ levels }: { levels: number }) {
  const N = Math.max(1, levels);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes rl-drift-r { from { transform: translateX(-30%); } to { transform: translateX(130%); } }
        @keyframes rl-drift-l { from { transform: translateX(130%); } to { transform: translateX(-30%); } }
        @keyframes rl-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes rl-glow { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }
        @keyframes rl-mist { 0%,100% { opacity: 0.12; } 50% { opacity: 0.22; } }
      `}</style>

      {/* Deep ocean vertical gradient — bright blue surface fading into abyss */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #7fb5d9 0%, #4a86ad 10%, #1f4e75 25%, #0b2947 48%, #04101f 78%, #01030a 100%)",
        }}
      />
      {/* Volumetric shafts of light near the surface */}
      <div
        className="absolute inset-x-0 top-0"
        style={{
          height: `${(1 / N) * 100}%`,
          background:
            "radial-gradient(ellipse at 30% 0%, rgba(255,255,255,0.28), transparent 55%), radial-gradient(ellipse at 70% 0%, rgba(255,255,255,0.18), transparent 60%)",
          animation: "rl-mist 8s ease-in-out infinite",
        }}
      />

      {/* Iceberg silhouette — single traditional peak, cinematic */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="rl-ice-top" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="60%" stopColor="#f4fbff" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#d5e6f2" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="rl-ice-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#cfe2ee" stopOpacity="0.75" />
            <stop offset="35%" stopColor="#7ea3bd" stopOpacity="0.55" />
            <stop offset="70%" stopColor="#2f4e6c" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#050a14" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id="rl-ice-shadow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id="rl-water-line" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b1a2c" stopOpacity="0" />
            <stop offset="100%" stopColor="#0b1a2c" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* Above-water crown — ONE main pointed peak with subtle shoulders */}
        <polygon
          points="50,2 58,10 64,15 72,19 28,19 36,15 42,10"
          fill="url(#rl-ice-top)"
          opacity="0.98"
        />
        {/* Soft snow shading on the right face of the peak */}
        <polygon
          points="50,2 58,10 64,15 72,19 55,19"
          fill="#b7cfe0"
          opacity="0.35"
        />
        {/* Underwater body — massive, cavernous, uneven */}
        <polygon
          points="28,19 72,19 88,28 95,42 93,55 87,68 79,80 66,92 52,98 38,96 22,88 9,72 4,55 7,38 14,26"
          fill="url(#rl-ice-body)"
          opacity="0.7"
        />
        {/* Right-side shadow to add depth */}
        <polygon
          points="55,19 72,19 88,28 95,42 93,55 87,68 79,80 66,92 58,94"
          fill="url(#rl-ice-shadow)"
          opacity="0.55"
        />
        {/* Water line */}
        <rect x="0" y="18.5" width="100" height="1.2" fill="url(#rl-water-line)" opacity="0.65" />
        {/* Deep vertical cracks */}
        <path d="M36 21 L34 44 L38 66 L34 92" stroke="#fff" strokeOpacity="0.14" strokeWidth="0.25" fill="none" />
        <path d="M56 21 L60 40 L54 62 L60 84" stroke="#fff" strokeOpacity="0.14" strokeWidth="0.25" fill="none" />
        <path d="M70 22 L66 48 L74 74" stroke="#000" strokeOpacity="0.28" strokeWidth="0.25" fill="none" />
        <path d="M26 24 L30 50 L22 76" stroke="#000" strokeOpacity="0.28" strokeWidth="0.25" fill="none" />
        {/* Chipped edges — small triangular fragments floating away */}
        <polygon points="8,52 6,54 9,55" fill="#fff" opacity="0.35" />
        <polygon points="93,66 95,68 92,69" fill="#fff" opacity="0.3" />
        {/* Faint bubble trails */}
        <g fill="#fff" opacity="0.18">
          <circle cx="20" cy="82" r="0.35" />
          <circle cx="22" cy="74" r="0.28" />
          <circle cx="19" cy="66" r="0.22" />
          <circle cx="78" cy="80" r="0.4" />
          <circle cx="80" cy="71" r="0.3" />
        </g>
      </svg>


      {/* Creatures per level. Depth ratio decides the species and tint.
          Level 0 is the tip above the waterline — no marine life there. */}
      {Array.from({ length: N }).map((_, levelIdx) => {
        if (levelIdx === 0) return null;
        const depth = N > 1 ? levelIdx / (N - 1) : 0;

        let variant: RealCreatureVariant = "whale";
        if (depth > 0.85) variant = "angler";
        else if (depth > 0.62) variant = "kraken";
        else if (depth > 0.4) variant = "shark";
        else if (depth > 0.2) variant = "jellyfish";
        else variant = "whale";

        // Requested behavior: dark silhouettes on top, light silhouettes deep.
        const tint = depth < 0.35 ? "#020814" : depth < 0.7 ? "#d7e2ec" : "#eef4fb";
        const opacity = depth < 0.35 ? 0.55 : depth < 0.7 ? 0.32 : 0.42;

        const count = variant === "angler" ? 3 : variant === "kraken" ? 2 : variant === "whale" ? 2 : 4;
        const creatures = Array.from({ length: count }).map((__, k) => {
          const s1 = seeded(`r-${levelIdx}-${k}-a`);
          const s2 = seeded(`r-${levelIdx}-${k}-b`);
          const s3 = seeded(`r-${levelIdx}-${k}-c`);
          return {
            key: `${levelIdx}-${k}`,
            dir: (s1 > 0.5 ? "r" : "l") as "r" | "l",
            delay: -s2 * 60,
            duration: 60 + s3 * 60,
            yPct: 12 + s1 * 74,
            scale: 0.8 + s2 * 0.7,
          };
        });

        return (
          <div
            key={levelIdx}
            className="absolute left-0 right-0"
            style={{
              top: `${(levelIdx / N) * 100}%`,
              height: `${(1 / N) * 100}%`,
            }}
          >
            {creatures.map((c) => (
              <RealCreature
                key={c.key}
                variant={variant}
                dir={c.dir}
                delay={c.delay}
                duration={c.duration}
                yPct={c.yPct}
                scale={c.scale}
                tint={tint}
                opacity={opacity}
              />
            ))}
          </div>
        );
      })}

      {/* Subtle vignette to sell the "documentary" mood */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      {/* Film grain */}
      <div
        className="absolute inset-0 mix-blend-overlay opacity-[0.18]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.7 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
    </div>
  );
}

type RealCreatureVariant = "whale" | "jellyfish" | "shark" | "kraken" | "angler";

function RealCreature({
  variant,
  dir,
  delay,
  duration,
  yPct,
  scale,
  tint,
  opacity,
}: {
  variant: RealCreatureVariant;
  dir: "l" | "r";
  delay: number;
  duration: number;
  yPct: number;
  scale: number;
  tint: string;
  opacity: number;
}) {
  const baseSize =
    variant === "whale" ? 220 : variant === "kraken" ? 180 : variant === "shark" ? 150 : variant === "angler" ? 130 : 90;
  const size = Math.round(baseSize * scale);
  return (
    <div
      className="absolute left-0 right-0"
      style={{
        top: `${yPct}%`,
        opacity,
        animation: `${dir === "r" ? "rl-drift-r" : "rl-drift-l"} ${duration}s linear ${delay}s infinite`,
        filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.4))",
      }}
    >
      <div style={{ width: size, animation: "rl-bob 4.6s ease-in-out infinite" }}>
        {/* SVGs are drawn facing LEFT by default; flip when swimming right so
            the creatures face their travel direction. */}
        <div style={{ transform: dir === "r" ? "scaleX(-1)" : undefined, transformOrigin: "center" }}>
          {variant === "whale" && (
            <svg viewBox="0 0 200 80" width={size} height={size * 0.4} fill={tint}>
              {/* Blue-whale silhouette */}
              <path d="M10 44 Q40 20 100 24 Q150 26 176 36 L192 30 L188 44 L196 52 L180 52 Q160 58 130 58 Q90 64 60 60 Q30 58 10 50 Z" />
              <path d="M96 26 Q100 14 108 12 Q112 20 108 26 Z" opacity="0.85" />
              <circle cx="24" cy="42" r="1.6" fill="#000" opacity="0.55" />
            </svg>
          )}
          {variant === "shark" && (
            <svg viewBox="0 0 200 70" width={size} height={size * 0.35} fill={tint}>
              {/* Great white silhouette */}
              <path d="M6 36 Q40 12 110 18 Q160 22 178 32 L196 22 L192 40 L200 50 L180 48 Q160 56 120 56 Q80 60 46 54 L30 62 L34 50 L14 46 Z" />
              <path d="M104 18 Q108 4 116 4 Q118 12 112 20 Z" />
              <circle cx="22" cy="34" r="1.4" fill="#000" opacity="0.55" />
              <path d="M18 40 L34 42 L26 44 Z" fill="#000" opacity="0.35" />
            </svg>
          )}
          {variant === "jellyfish" && (
            <svg viewBox="0 0 80 120" width={size * 0.6} height={size * 0.9} fill={tint}>
              <path d="M8 40 Q8 6 40 6 Q72 6 72 40 Q72 46 66 48 L14 48 Q8 46 8 40 Z" opacity="0.85" />
              <path d="M18 48 Q20 80 14 116" fill="none" stroke={tint} strokeWidth="1.4" opacity="0.7" />
              <path d="M28 48 Q30 90 24 118" fill="none" stroke={tint} strokeWidth="1.4" opacity="0.7" />
              <path d="M40 48 Q42 96 36 120" fill="none" stroke={tint} strokeWidth="1.4" opacity="0.7" />
              <path d="M52 48 Q54 90 48 118" fill="none" stroke={tint} strokeWidth="1.4" opacity="0.7" />
              <path d="M62 48 Q60 80 66 116" fill="none" stroke={tint} strokeWidth="1.4" opacity="0.7" />
            </svg>
          )}
          {variant === "kraken" && (
            <svg viewBox="0 0 200 180" width={size} height={size * 0.9} fill={tint}>
              {/* Kraken head + long tentacles */}
              <path d="M60 40 Q60 8 100 8 Q140 8 140 40 Q140 60 120 66 L80 66 Q60 60 60 40 Z" />
              <circle cx="82" cy="34" r="2" fill="#000" opacity="0.5" />
              <circle cx="118" cy="34" r="2" fill="#000" opacity="0.5" />
              <path d="M68 62 Q40 100 20 170" fill="none" stroke={tint} strokeWidth="4" strokeLinecap="round" opacity="0.85" />
              <path d="M84 66 Q70 120 60 178" fill="none" stroke={tint} strokeWidth="4" strokeLinecap="round" opacity="0.85" />
              <path d="M100 68 Q104 130 96 180" fill="none" stroke={tint} strokeWidth="4" strokeLinecap="round" opacity="0.85" />
              <path d="M116 66 Q130 120 140 178" fill="none" stroke={tint} strokeWidth="4" strokeLinecap="round" opacity="0.85" />
              <path d="M132 62 Q160 100 180 170" fill="none" stroke={tint} strokeWidth="4" strokeLinecap="round" opacity="0.85" />
              <path d="M74 64 Q56 90 42 138" fill="none" stroke={tint} strokeWidth="3" strokeLinecap="round" opacity="0.7" />
              <path d="M126 64 Q144 90 158 138" fill="none" stroke={tint} strokeWidth="3" strokeLinecap="round" opacity="0.7" />
            </svg>
          )}
          {variant === "angler" && (
            <div className="relative">
              <svg viewBox="0 0 160 90" width={size} height={size * 0.56} fill={tint}>
                {/* Bulbous head, gaping jaw with teeth, lure rod */}
                <path d="M12 46 Q30 8 88 14 Q124 20 138 42 L156 30 L150 52 L158 68 L138 62 Q120 74 84 74 Q42 78 20 62 L4 70 L10 54 Z" />
                {/* Teeth */}
                <polygon points="70,50 74,60 78,50" fill="#0b0b0b" opacity="0.7" />
                <polygon points="82,50 86,62 90,50" fill="#0b0b0b" opacity="0.7" />
                <polygon points="94,50 98,60 102,50" fill="#0b0b0b" opacity="0.7" />
                <polygon points="76,42 80,32 84,42" fill="#0b0b0b" opacity="0.7" />
                <polygon points="90,42 94,32 98,42" fill="#0b0b0b" opacity="0.7" />
                {/* Eye */}
                <circle cx="42" cy="40" r="3" fill="#000" opacity="0.85" />
                <circle cx="42" cy="40" r="1.4" fill="#fde68a" />
                {/* Rod */}
                <path d="M50 22 Q30 -8 70 -14" stroke={tint} strokeWidth="1.8" fill="none" />
              </svg>
              <span
                className="absolute rounded-full"
                style={{
                  left: size * 0.42,
                  top: -size * 0.09,
                  width: size * 0.11,
                  height: size * 0.11,
                  background: "radial-gradient(circle,#fef3c7,#f59e0b 55%,transparent 72%)",
                  animation: "rl-glow 2.4s ease-in-out infinite",
                  boxShadow: "0 0 18px rgba(245,158,11,0.85)",
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
