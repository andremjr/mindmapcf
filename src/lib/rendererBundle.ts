import JSZip from "jszip";
import type { Project } from "./types";
import { buildExport } from "./renderExport";

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

export async function downloadRendererZip(project: Project) {
  const zip = new JSZip();
  const root = zip.folder("remotion-renderer")!;
  for (const [path, content] of Object.entries(FILES)) {
    root.file(path, content);
  }
  // Inject the current project JSON so `npm run render` works out of the box.
  const exportData = buildExport(project);
  root.file("project.json", JSON.stringify(exportData, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.id}-remotion-renderer.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
