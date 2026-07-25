import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { MindNode, Project } from "@/lib/types";
import { resolveImage } from "@/lib/imageStorage";
import { PresentationShell } from "@/components/shared/PresentationShell";
import { AvatarLayer } from "@/components/shared/AvatarLayer";
import { formatValue, parseItemData, parseScaleConfig } from "@/lib/scaleConfig";
import { orderItems } from "./ScaleEditor";

// Bar footprint stays constant across the scene; only height varies.
const BAR_WIDTH = 6;
const BAR_DEPTH = 6;
// The row advances diagonally, so previous bars remain visible over the shoulder.
const STEP_X = 8.5;
const STEP_Z = -5.2;
const BASE_BAR_HEIGHT = 36;
const MIN_BAR_HEIGHT = 3;
const CAMERA_FOV = 36;
const PANEL_SIZE = 5.4;
const PANEL_MARGIN_TOP = 0.35;

type ScaleStep =
  | { kind: "empty" }
  | { kind: "overview" }
  | { kind: "focus"; index: number };

type SceneItem = {
  node: MindNode;
  data: ReturnType<typeof parseItemData>;
  position: THREE.Vector3; // base center of bar (y = 0)
  height: number;
  value: number;
  color: string;
  panelCenter: THREE.Vector3; // world-space center of the front-face panel
  index: number;
};

type CameraTarget = { position: THREE.Vector3; lookAt: THREE.Vector3 };

export function ScalePresentation({ project, recording }: { project: Project; recording: boolean }) {
  const rootNode = project.nodes.find((n) => n.role === "scale" || !n.parentId);
  const items = useMemo(
    () => project.nodes.filter((n) => n.role === "item" && n.parentId === rootNode?.id),
    [project.nodes, rootNode?.id],
  );
  const config = useMemo(() => parseScaleConfig(rootNode?.body), [rootNode?.body]);
  const ordered = useMemo(() => orderItems(items, config.sortMode), [items, config.sortMode]);

  const steps: ScaleStep[] = useMemo(() => {
    if (!ordered.length) return [{ kind: "empty" }];
    const seq: ScaleStep[] = [{ kind: "overview" }];
    ordered.forEach((_, index) => seq.push({ kind: "focus", index }));
    return seq;
  }, [ordered]);

  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (stepIdx >= steps.length) setStepIdx(Math.max(0, steps.length - 1));
  }, [stepIdx, steps.length]);

  const active = steps[stepIdx] ?? { kind: "empty" };

  return (
    <PresentationShell
      project={project}
      recording={recording}
      navLabel={`${stepIdx + 1} / ${steps.length}`}
      onNext={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))}
      onPrev={() => setStepIdx((i) => Math.max(0, i - 1))}
      canNext={stepIdx < steps.length - 1}
      canPrev={stepIdx > 0}
      frameBg="bg-background"
    >
      {({ size }) => (
        <ScaleFrame
          size={size}
          items={ordered}
          config={config}
          step={active}
          project={project}
        />
      )}
    </PresentationShell>
  );
}

function ScaleFrame({
  size, items, config, step, project,
}: {
  size: { w: number; h: number };
  items: MindNode[];
  config: ReturnType<typeof parseScaleConfig>;
  step: ScaleStep;
  project: Project;
}) {
  // Resolve image URLs asynchronously (indexeddb blobs / user uploads).
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let alive = true;
    Promise.all(items.map(async (node) => {
      if (node.image) return [node.id, node.image] as const;
      if (node.imageRef) {
        try {
          const u = await resolveImage(node.imageRef);
          return [node.id, u ?? null] as const;
        } catch {
          return [node.id, null] as const;
        }
      }
      return [node.id, null] as const;
    })).then((pairs) => {
      if (!alive) return;
      const next: Record<string, string | null> = {};
      for (const [id, u] of pairs) next[id] = u;
      setUrls(next);
    });
    return () => { alive = false; };
  }, [items]);

  const sceneItems = useMemo<SceneItem[]>(() => {
    const parsed = items.map((node) => ({ node, data: parseItemData(node.body) }));
    // Reference: smallest strictly-positive value keeps the very first bar visually tall
    // enough to become the yardstick for everything after it.
    const positives = parsed
      .map((it) => (Number.isFinite(it.data.value) ? it.data.value : 0))
      .filter((v) => v > 0);
    const reference = positives.length ? Math.min(...positives) : 1;

    return parsed.map((item, index) => {
      const value = Number.isFinite(item.data.value) ? Math.max(0, item.data.value) : 0;
      const height = value > 0
        ? Math.max(MIN_BAR_HEIGHT, (value / reference) * BASE_BAR_HEIGHT)
        : MIN_BAR_HEIGHT;
      const position = new THREE.Vector3(index * STEP_X, 0, index * STEP_Z);
      const panelHeight = PANEL_SIZE;
      // Panel sits high on the front face, integrated with the bar surface.
      const panelCenterY = Math.max(
        panelHeight / 2 + PANEL_MARGIN_TOP,
        height - panelHeight / 2 - PANEL_MARGIN_TOP,
      );
      const panelCenter = new THREE.Vector3(
        position.x,
        panelCenterY,
        position.z + BAR_DEPTH / 2 + 0.02,
      );
      return {
        node: item.node,
        data: item.data,
        position,
        height,
        value,
        color: item.node.color ?? config.barColor,
        panelCenter,
        index,
      };
    });
  }, [config.barColor, items]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {sceneItems.length ? (
        <ScaleThreeScene
          size={size}
          sceneItems={sceneItems}
          config={config}
          step={step}
          urls={urls}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-background text-muted-foreground">
          Adicione itens para apresentar a comparação.
        </div>
      )}

      <div className="absolute inset-x-0 top-5 flex justify-center pointer-events-none">
        <div className="px-4 py-2 rounded-full bg-background/60 backdrop-blur text-foreground/85 text-sm border border-border">
          {config.caption || "Uma comparação em escala."}
        </div>
      </div>

      <AvatarLayer project={project} frameSize={size} />
    </div>
  );
}

function ScaleThreeScene({
  size, sceneItems, config, step, urls,
}: {
  size: { w: number; h: number };
  sceneItems: SceneItem[];
  config: ReturnType<typeof parseScaleConfig>;
  step: ScaleStep;
  urls: Record<string, string | null>;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const posRef = useRef(new THREE.Vector3());
  const lookRef = useRef(new THREE.Vector3());
  const targetRef = useRef<CameraTarget | null>(null);
  const sizeRef = useRef(size);

  // Handle resize.
  useEffect(() => {
    sizeRef.current = size;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!renderer || !camera) return;
    const width = Math.max(1, Math.floor(size.w));
    const height = Math.max(1, Math.floor(size.h));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }, [size]);

  // Camera targets follow the presentation step.
  useEffect(() => {
    const aspect = Math.max(0.1, sizeRef.current.w / Math.max(1, sizeRef.current.h));
    targetRef.current = computeCameraTarget(sceneItems, step, aspect);
  }, [step, sceneItems]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = Math.max(1, Math.floor(sizeRef.current.w));
    const height = Math.max(1, Math.floor(sizeRef.current.h));
    const maxHeight = Math.max(...sceneItems.map((it) => it.height), 1);
    const spanZ = Math.abs(sceneItems.length * STEP_Z) + 200;
    const farPlane = Math.max(6000, maxHeight * 6, spanZ * 4);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e8eef7");
    scene.fog = new THREE.Fog(0xdfe6f2, Math.max(120, maxHeight * 0.6), Math.max(1600, maxHeight * 4));

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, 0.05, farPlane);
    const initialAspect = width / height;
    const initialTarget = computeCameraTarget(sceneItems, step, initialAspect);
    camera.position.copy(initialTarget.position);
    posRef.current.copy(initialTarget.position);
    lookRef.current.copy(initialTarget.lookAt);
    camera.lookAt(lookRef.current);
    targetRef.current = initialTarget;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    // --- Lighting: soft, uniform daylight -----------------------------------
    scene.add(new THREE.HemisphereLight(0xffffff, 0xbfc9d9, 0.9));

    const key = new THREE.DirectionalLight(0xffffff, 1.55);
    key.position.set(60, 120, 90);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 5;
    key.shadow.camera.far = Math.max(1200, maxHeight * 4);
    const shadowSpan = Math.max(180, sceneItems.length * STEP_X + 200);
    key.shadow.camera.left = -shadowSpan;
    key.shadow.camera.right = shadowSpan;
    key.shadow.camera.top = shadowSpan;
    key.shadow.camera.bottom = -shadowSpan;
    key.shadow.bias = -0.0004;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-80, 60, 40);
    scene.add(fill);

    // Optional accent rim to catch the front face color.
    const rim = new THREE.DirectionalLight(hexColor(config.accentColor), 0.35);
    rim.position.set(0, 40, 220);
    scene.add(rim);

    buildScene(scene, sceneItems, config, urls);

    rendererRef.current = renderer;
    cameraRef.current = camera;
    sceneRef.current = scene;

    let raf = 0;
    const clock = new THREE.Clock();

    const render = () => {
      const dt = Math.min(0.05, clock.getDelta());
      const tgt = targetRef.current;
      if (tgt) {
        // Slow-in / slow-out via exponential smoothing.
        const smooth = 1 - Math.exp(-dt * 1.35);
        posRef.current.lerp(tgt.position, smooth);
        lookRef.current.lerp(tgt.lookAt, smooth);
        camera.position.copy(posRef.current);
        camera.lookAt(lookRef.current);
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      rendererRef.current = null;
      cameraRef.current = null;
      sceneRef.current = null;
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => disposeMaterial(m));
          else disposeMaterial(mat);
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
    // Rebuild the world when data / colors / images change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneItems, config, urls]);

  return <div ref={mountRef} className="absolute inset-0" />;
}

// ============================================================================
// Scene assembly
// ============================================================================

function buildScene(
  scene: THREE.Scene,
  sceneItems: SceneItem[],
  config: ReturnType<typeof parseScaleConfig>,
  urls: Record<string, string | null>,
) {
  // --- Ground ---------------------------------------------------------------
  const spanX = Math.max(400, sceneItems.length * STEP_X * 2 + 400);
  const spanZ = Math.max(400, Math.abs(sceneItems.length * STEP_Z) * 2 + 400);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(spanX, spanZ, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0xe4ebf5,
      roughness: 0.95,
      metalness: 0.02,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  const midX = ((sceneItems.length - 1) * STEP_X) / 2;
  const midZ = ((sceneItems.length - 1) * STEP_Z) / 2;
  ground.position.set(midX, 0, midZ);
  ground.receiveShadow = true;
  scene.add(ground);

  // Subtle grid — helps read parallax without competing with the bars.
  const grid = new THREE.GridHelper(
    Math.max(spanX, spanZ),
    Math.max(20, Math.round(Math.max(spanX, spanZ) / 12)),
    0xb8c2d1,
    0xd6dde8,
  );
  grid.position.set(midX, 0.01, midZ);
  const gridMat = grid.material;
  if (Array.isArray(gridMat)) gridMat.forEach((m) => { m.transparent = true; m.opacity = 0.35; });
  else { gridMat.transparent = true; gridMat.opacity = 0.35; }
  scene.add(grid);

  // Horizon disc — clean, distant fade.
  const horizon = new THREE.Mesh(
    new THREE.PlaneGeometry(spanX * 3, 1),
    new THREE.MeshBasicMaterial({ color: 0xdfe6f2 }),
  );
  horizon.position.set(midX, 0, midZ - spanZ);
  scene.add(horizon);

  // --- Bars -----------------------------------------------------------------
  sceneItems.forEach((item) => {
    const color = new THREE.Color(item.color);
    const barMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      metalness: 0.18,
    });
    const geo = new THREE.BoxGeometry(BAR_WIDTH, item.height, BAR_DEPTH);
    const bar = new THREE.Mesh(geo, barMat);
    bar.position.set(item.position.x, item.height / 2, item.position.z);
    bar.castShadow = true;
    bar.receiveShadow = true;
    scene.add(bar);

    // Top cap — subtle highlight strip.
    const capThickness = 0.18;
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(BAR_WIDTH * 1.02, capThickness, BAR_DEPTH * 1.02),
      new THREE.MeshStandardMaterial({
        color: color.clone().lerp(new THREE.Color(0xffffff), 0.35),
        roughness: 0.4,
        metalness: 0.2,
      }),
    );
    cap.position.set(item.position.x, item.height + capThickness / 2, item.position.z);
    cap.castShadow = true;
    scene.add(cap);

    // --- Front-face panel (canvas texture) ---------------------------------
    const panelTexture = makePanelTexture(item, urls[item.node.id] ?? null, config);
    const panelMat = new THREE.MeshBasicMaterial({
      map: panelTexture,
      toneMapped: false,
    });
    const panelGeo = new THREE.PlaneGeometry(PANEL_SIZE, PANEL_SIZE);
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.copy(item.panelCenter);
    scene.add(panel);

    // Thin accent frame around the panel — reinforces the "applied" look.
    const frameThickness = 0.06;
    const frameGeo = new THREE.PlaneGeometry(PANEL_SIZE + 0.14, PANEL_SIZE + 0.14);
    const frameMat = new THREE.MeshBasicMaterial({
      color: hexColor(config.accentColor),
      transparent: true,
      opacity: 0.9,
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.copy(item.panelCenter);
    frame.position.z -= 0.005;
    frame.scale.multiplyScalar(1);
    void frameThickness; // kept for reference; real depth handled by z-offset
    scene.add(frame);
  });
}

function disposeMaterial(mat: THREE.Material) {
  const anyMat = mat as unknown as { map?: THREE.Texture | null };
  if (anyMat.map) anyMat.map.dispose?.();
  mat.dispose();
}

// ============================================================================
// Panel texture — image + name + value baked into a canvas per bar.
// ============================================================================

function makePanelTexture(
  item: SceneItem,
  url: string | null,
  config: ReturnType<typeof parseScaleConfig>,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  drawPanel(ctx, item, null, config);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (url) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        drawPanel(ctx, item, img, config);
        tex.needsUpdate = true;
      } catch {
        /* tainted canvas — keep placeholder */
      }
    };
    img.onerror = () => { /* keep placeholder */ };
    img.src = url;
  }
  return tex;
}

function drawPanel(
  ctx: CanvasRenderingContext2D,
  item: SceneItem,
  img: HTMLImageElement | null,
  config: ReturnType<typeof parseScaleConfig>,
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Panel background — dark card so it reads on any bar color.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0f172a");
  bg.addColorStop(1, "#111c33");
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 44);
  ctx.fill();

  // Accent inner border.
  ctx.strokeStyle = config.accentColor;
  ctx.lineWidth = 6;
  roundRect(ctx, 14, 14, W - 28, H - 28, 36);
  ctx.stroke();

  // Rank chip (top-left).
  const chip = `#${item.index + 1}`;
  ctx.fillStyle = config.accentColor;
  roundRect(ctx, 34, 34, 130, 60, 30);
  ctx.fill();
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 40px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(chip, 34 + 65, 34 + 30);

  // Image area (large, top ~55%).
  const pad = 44;
  const imgY = 120;
  const imgW = W - pad * 2;
  const imgH = Math.round(H * 0.5);
  ctx.save();
  roundRect(ctx, pad, imgY, imgW, imgH, 26);
  ctx.clip();
  if (img && img.width > 0 && img.height > 0) {
    const ir = img.width / img.height;
    const br = imgW / imgH;
    let dw: number, dh: number, dx: number, dy: number;
    if (ir > br) {
      dh = imgH;
      dw = dh * ir;
      dx = pad - (dw - imgW) / 2;
      dy = imgY;
    } else {
      dw = imgW;
      dh = dw / ir;
      dx = pad;
      dy = imgY - (dh - imgH) / 2;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
  } else {
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(pad, imgY, imgW, imgH);
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 260px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((item.node.text || "?").slice(0, 1).toUpperCase(), W / 2, imgY + imgH / 2);
  }
  ctx.restore();

  // Name.
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 62px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const nameY = imgY + imgH + 26;
  fitText(ctx, item.node.text || "", W / 2, nameY, W - pad * 2);

  // Value — the hero number.
  ctx.fillStyle = config.accentColor;
  ctx.font = "900 128px system-ui, -apple-system, Segoe UI, sans-serif";
  const valY = nameY + 90;
  ctx.fillText(formatValue(item.value), W / 2, valY);

  // Unit.
  const unit = item.data.unit || config.unit;
  if (unit) {
    ctx.fillStyle = "#cbd5f5";
    ctx.font = "500 44px system-ui, sans-serif";
    ctx.fillText(unit, W / 2, valY + 140);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
) {
  let size = 62;
  ctx.font = `bold ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  while (size > 28 && ctx.measureText(text).width > maxWidth) {
    size -= 4;
    ctx.font = `bold ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  }
  ctx.fillText(text, x, y);
}

// ============================================================================
// Camera choreography
// ============================================================================

function computeCameraTarget(
  sceneItems: SceneItem[],
  step: ScaleStep,
  aspect: number,
): CameraTarget {
  if (!sceneItems.length || step.kind === "empty") {
    return {
      position: new THREE.Vector3(0, 20, 40),
      lookAt: new THREE.Vector3(0, 6, 0),
    };
  }

  const verticalFov = THREE.MathUtils.degToRad(CAMERA_FOV);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(0.1, aspect));

  // Overview: high, tilted, looking down the diagonal row.
  if (step.kind === "overview") {
    const first = sceneItems[0];
    const last = sceneItems[Math.min(sceneItems.length - 1, 3)];
    const midX = (first.position.x + last.position.x) / 2;
    const midZ = (first.position.z + last.position.z) / 2;
    const maxH = Math.max(...sceneItems.slice(0, 4).map((it) => it.height));
    return {
      position: new THREE.Vector3(midX - STEP_X * 1.2, Math.max(28, maxH * 0.9), midZ + Math.abs(STEP_Z) * 4 + 26),
      lookAt: new THREE.Vector3(midX + STEP_X * 0.8, Math.max(6, maxH * 0.35), midZ),
    };
  }

  // Focus on a specific bar — travelling camera positioned in front of the
  // bar's panel, slightly toward the next bar so previous bars stay visible
  // over the shoulder.
  const idx = Math.max(0, Math.min(sceneItems.length - 1, step.index));
  const current = sceneItems[idx];
  const next = sceneItems[idx + 1];

  const distV = (PANEL_SIZE / 2) / Math.tan(verticalFov / 2) * 1.75;
  const distH = (PANEL_SIZE / 2) / Math.tan(horizontalFov / 2) * 1.75;
  const distance = Math.max(distV, distH);

  // Push the camera slightly along the travel direction (toward next bar)
  // and to the "outside" of the diagonal so the previous bars line up in frame.
  const forward = new THREE.Vector3(0, 0, 1); // panels face +Z
  const travel = next
    ? new THREE.Vector3(next.position.x - current.position.x, 0, next.position.z - current.position.z).normalize()
    : new THREE.Vector3(STEP_X, 0, STEP_Z).normalize();

  const lateral = 2.2;
  const heightBias = 0.4;

  const pos = new THREE.Vector3()
    .copy(current.panelCenter)
    .addScaledVector(forward, distance)
    .addScaledVector(travel, lateral)
    .add(new THREE.Vector3(0, heightBias, 0));

  const look = current.panelCenter.clone();

  return { position: pos, lookAt: look };
}

// ============================================================================
// Helpers
// ============================================================================

function hexColor(value: string) {
  try { return new THREE.Color(value); }
  catch { return new THREE.Color("#38bdf8"); }
}
