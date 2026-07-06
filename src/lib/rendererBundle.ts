import JSZip from "jszip";
import type { Project, SfxAsset } from "./types";
import { buildExport } from "./renderExport";
import { bakeSynthSfx, synthKindFor } from "./sfxBaker";

// Raw imports — Vite bundles each file's source as a string.
import pkgJson from "../../remotion-renderer/package.json?raw";
import tsconfig from "../../remotion-renderer/tsconfig.json?raw";
import remotionConfig from "../../remotion-renderer/remotion.config.ts?raw";
import readme from "../../remotion-renderer/README.md?raw";
import gitignore from "../../remotion-renderer/.gitignore?raw";
import publicReadme from "../../remotion-renderer/public/README.md?raw";
import indexSrc from "../../remotion-renderer/src/index.tsx?raw";
import rootSrc from "../../remotion-renderer/src/Root.tsx?raw";
import canvasSrc from "../../remotion-renderer/src/CanvasNarrativo.tsx?raw";
import cameraSrc from "../../remotion-renderer/src/cameraEngine.ts?raw";
import typesSrc from "../../remotion-renderer/src/types.ts?raw";

const FILES: Record<string, string> = {
  "package.json": pkgJson,
  "tsconfig.json": tsconfig,
  "remotion.config.ts": remotionConfig,
  "README.md": readme,
  ".gitignore": gitignore,
  "public/README.md": publicReadme,
  "src/index.tsx": indexSrc,
  "src/Root.tsx": rootSrc,
  "src/CanvasNarrativo.tsx": canvasSrc,
  "src/cameraEngine.ts": cameraSrc,
  "src/types.ts": typesSrc,
};

function sanitizeFilename(name: string, fallback: string): string {
  const trimmed = (name || "").split(/[\\/]/).pop() || fallback;
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_") || fallback;
}

function extForMime(mime: string): string {
  if (/mpeg|mp3/i.test(mime)) return "mp3";
  if (/wav/i.test(mime)) return "wav";
  if (/ogg/i.test(mime)) return "ogg";
  if (/webm/i.test(mime)) return "webm";
  if (/aac|m4a|mp4/i.test(mime)) return "m4a";
  if (/flac/i.test(mime)) return "flac";
  return "audio";
}

async function fetchAudioBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch (err) {
    console.warn("[rendererBundle] Falha ao obter áudio original:", err);
    return null;
  }
}

export async function downloadRendererZip(project: Project) {
  const zip = new JSZip();
  const root = zip.folder("remotion-renderer")!;
  for (const [path, content] of Object.entries(FILES)) {
    root.file(path, content);
  }

  const exportData = buildExport(project);
  const projectJson: typeof exportData & {
    audio: (typeof exportData)["audio"] & Record<string, unknown> | null;
  } = JSON.parse(JSON.stringify(exportData));

  // 1) Áudio principal — inclui o arquivo em public/audio/ e aponta project.json para ele.
  if (project.audio) {
    const rawName = project.audio.name || `audio.${extForMime(project.audio.mimeType || "")}`;
    const filename = sanitizeFilename(rawName, `audio.${extForMime(project.audio.mimeType || "")}`);
    const publicPath = `audio/${filename}`;

    const src = project.audio.objectUrl;
    if (src) {
      const bytes = await fetchAudioBytes(src);
      if (bytes) {
        root.file(`public/${publicPath}`, bytes);
        if (projectJson.audio) {
          projectJson.audio.file = publicPath;
          // Remove objectUrl — não é resolvível fora do navegador.
          delete (projectJson.audio as Record<string, unknown>).objectUrl;
        }
      } else {
        console.warn(
          "[rendererBundle] Áudio não pôde ser lido — o zip incluirá project.json sem áudio embutido.",
        );
      }
    }
  }

  // 2) SFX sintetizados usados no projeto → renderizados como WAVs em public/sfx/.
  const usedAssets = new Set<string>();
  for (const e of projectJson.sfxEvents ?? []) {
    if (e.enabled !== false && e.soundId) usedAssets.add(e.soundId);
  }
  const registry: SfxAsset[] = projectJson.assetRegistry ?? [];
  const synthAssets = registry.filter(
    (a) => a.origin === "synth" && usedAssets.has(a.id),
  );
  if (synthAssets.length > 0) {
    const kinds = synthAssets.map((a) => synthKindFor(a.kind));
    const wavs = await bakeSynthSfx(kinds);
    for (const asset of synthAssets) {
      const sk = synthKindFor(asset.kind);
      const bytes = wavs[sk];
      if (!bytes) continue;
      const publicPath = `sfx/${sk}.wav`;
      root.file(`public/${publicPath}`, bytes);
      // Reescreve a entrada no registry exportado para apontar para o arquivo.
      const patched = registry.find((a) => a.id === asset.id);
      if (patched) {
        patched.file = publicPath;
        patched.origin = "public";
      }
    }
  }

  root.file("project.json", JSON.stringify(projectJson, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.id}-remotion-renderer.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
