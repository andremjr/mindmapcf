/**
 * "Ultra-realista" atmosphere — uses a photorealistic iceberg reference image
 * with a controlled composition (tip at top, waterline at ~1/5, underwater
 * body dominates). Stretched to fill the stacked column so the waterline
 * aligns with the split between level 0 and level 1.
 */
import ultraAsset from "@/assets/iceberg-ultra-realista.png.asset.json";

export function IcebergBackgroundUltra({ levels }: { levels: number }) {
  const N = Math.max(1, levels);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#01030a]">
      {/* Photoreal iceberg — object-fill keeps the silhouette proportional
          to the level bands with no cropping. */}
      <img
        src={ultraAsset.url}
        alt=""
        width={1024}
        height={1920}
        className="absolute inset-0 w-full h-full select-none"
        draggable={false}
        style={{ objectFit: "fill", opacity: 1 }}
      />
      {/* Subtle vertical polish for text legibility at extremes */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0.08) 45%, rgba(0,0,0,0.28) 80%, rgba(0,0,0,0.5) 100%)",
        }}
      />
      {/* Cinematic vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)",
        }}
      />
      {/* Light shafts near the surface, only on the top level */}
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
