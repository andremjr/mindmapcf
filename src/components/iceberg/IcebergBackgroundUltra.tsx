/**
 * "Ultra-realista" atmosphere — uses a photorealistic iceberg reference image
 * that spans the full column (sky/surface at top, deep abyss at bottom).
 * Adds subtle darkening per depth so text stays readable and creates the
 * cinematic feel the user asked for. No SVG creatures here — the image is
 * the star.
 */
import ultraAsset from "@/assets/iceberg-ultra-realista.png.asset.json";

export function IcebergBackgroundUltra({ levels }: { levels: number }) {
  const N = Math.max(1, levels);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Photoreal iceberg — stretched to the full column, cover to avoid gaps */}
      <img
        src={ultraAsset.url}
        alt=""
        className="absolute inset-0 w-full h-full object-cover select-none"
        draggable={false}
        style={{ opacity: 0.95 }}
      />
      {/* Subtle vertical darken gradient — surface stays bright, abyss goes black */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.05) 12%, rgba(0,0,0,0.18) 40%, rgba(0,0,0,0.55) 80%, rgba(0,0,0,0.75) 100%)",
        }}
      />
      {/* Soft cinematic vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)",
        }}
      />
      {/* Optional light-shafts near the very top (surface level only) */}
      <div
        className="absolute inset-x-0 top-0 mix-blend-screen"
        style={{
          height: `${(1 / N) * 100}%`,
          background:
            "radial-gradient(ellipse at 30% 0%, rgba(255,255,255,0.10), transparent 55%), radial-gradient(ellipse at 70% 0%, rgba(255,255,255,0.07), transparent 60%)",
        }}
      />
    </div>
  );
}
