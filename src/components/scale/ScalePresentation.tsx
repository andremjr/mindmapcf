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
const MAX_WORLD_BAR_HEIGHT = 120_000;
const MAX_MAJOR_RINGS_PER_BAR = 180;
const MAX_ALTITUDE_BANDS = 90;
const MAX_BACKGROUND_PILLAR_HEIGHT = 1_800;
const CAMERA_FOV = 36;
const PANEL_SIZE = 5.8;
const PANEL_MARGIN_TOP = 0.35;
// Big square photo that sits on top of the pedestal (viral-comparison style).
const TOP_IMAGE_SIZE = 7.4;
const TOP_IMAGE_LIFT = 0.6;

// Vibrant palette used when a bar has no custom color — cycles per index so
// consecutive bars are always visually distinct.
const AUTO_PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e",
];

type ScaleStep =
  | { kind: "empty" }
  | { kind: "overview" }
  | { kind: "focus"; index: number };

type SceneItem = {
  node: MindNode;
  data: ReturnType<typeof parseItemData>;
  position: THREE.Vector3; // base center of bar (y = 0)
  height: number;
  rawHeight: number;
  value: number;
  color: string;
  panelCenter: THREE.Vector3; // world-space center of the front-face panel
  index: number;
};

type CameraTarget = { position: THREE.Vector3; lookAt: THREE.Vector3 };

function isInitialDescent(from: ScaleStep, to: ScaleStep) {
  return from.kind === "overview" && to.kind === "focus" && to.index === 0;
}

function regularMoveDuration(distance: number) {
  return Math.min(
    5000,
    Math.max(1000, 800 + 900 * Math.log2(1 + distance / 20)),
  );
}

function initialDiveDuration(distance: number) {
  // No 5s ceiling for the opening drop: the curve keeps normal cases compact,
  // but gives universe-scale comparisons enough time to read as a real descent.
  return Math.max(3200, 2200 + 650 * Math.log2(1 + distance / 35));
}

function computeInitialDiveApproach(
  sceneItems: SceneItem[],
  startPos: THREE.Vector3,
  startLook: THREE.Vector3,
) {
  const first = sceneItems[0];
  if (!first) return null;
  const startDir = startLook.clone().sub(startPos).normalize();
  const anchor = new THREE.Vector3(
    first.position.x - STEP_X * 0.35,
    Math.max(first.panelCenter.y, first.height * 0.7, TOP_IMAGE_SIZE * 1.2),
    first.position.z - Math.abs(STEP_Z) * 0.45,
  );
  const approachDistance = Math.max(72, TOP_IMAGE_SIZE * 10, first.height * 1.35);
  return anchor.addScaledVector(startDir, -approachDistance);
}

// Bar-to-bar "climb" approach: rise above the target bar looking down so the
// viewer perceives the height comparison between the previous and next bar,
// then the tween settles into the front-facing framing on the target.
function computeClimbApproach(
  fromItem: SceneItem,
  toItem: SceneItem,
) {
  const goingUp = toItem.height >= fromItem.height;
  const peakHeight = Math.max(fromItem.height, toItem.height);
  // Rise a bit above the taller of the two so both tops are readable.
  const y = peakHeight + Math.max(TOP_IMAGE_SIZE * 2.2, peakHeight * 0.18);
  // Sit slightly behind the target on the diagonal so the camera can look
  // down onto the target bar (and see the previous one falling away).
  const backX = toItem.position.x - STEP_X * 0.55;
  const backZ = toItem.position.z - Math.abs(STEP_Z) * 0.65;
  const anchor = new THREE.Vector3(backX, y, backZ);
  // Pull the anchor away from the target laterally when descending so the
  // previous (taller) bar still appears in the shot for the comparison beat.
  if (!goingUp) {
    anchor.x -= STEP_X * 0.15;
    anchor.z -= Math.abs(STEP_Z) * 0.15;
  }
  return anchor;
}


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
      const rawHeight = value > 0
        ? Math.max(MIN_BAR_HEIGHT, (value / reference) * BASE_BAR_HEIGHT)
        : MIN_BAR_HEIGHT;
      const height = value > 0
        ? compressWorldHeight(rawHeight)
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
        rawHeight,
        value,
        color: item.node.color ?? AUTO_PALETTE[index % AUTO_PALETTE.length],
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
  // Camera tween state. Regular bar-to-bar moves keep a compact max duration;
  // the opening drop has its own guided approach so huge scales still feel
  // continuous instead of cutting into the first bar.
  const tweenRef = useRef<{
    startPos: THREE.Vector3;
    startLook: THREE.Vector3;
    endPos: THREE.Vector3;
    endLook: THREE.Vector3;
    approachPos: THREE.Vector3 | null;
    holdAngleUntil: number;
    initialDive: boolean;
    startAt: number;
    duration: number;
  } | null>(null);
  const sizeRef = useRef(size);
  const stepRef = useRef<ScaleStep>(step);

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
    const next = computeCameraTarget(sceneItems, step, aspect);
    targetRef.current = next;
    const previousStep = stepRef.current;
    stepRef.current = step;
    if (!cameraRef.current || !sceneRef.current) return;
    const startPos = posRef.current.clone();
    const startLook = lookRef.current.clone();
    const initialDive = isInitialDescent(previousStep, step);
    let approachPos: THREE.Vector3 | null = null;
    let holdAngleUntil = 0.55;
    if (initialDive) {
      approachPos = computeInitialDiveApproach(sceneItems, startPos, startLook);
      holdAngleUntil = 0.88;
    } else if (
      previousStep.kind === "focus" &&
      step.kind === "focus" &&
      previousStep.index !== step.index
    ) {
      const fromItem = sceneItems[previousStep.index];
      const toItem = sceneItems[step.index];
      if (fromItem && toItem) {
        approachPos = computeClimbApproach(fromItem, toItem);
        // Hold the "up looking down" framing for most of the tween, then
        // settle into the front-face focus near the end.
        holdAngleUntil = 0.62;
      }
    }
    const dist = approachPos
      ? startPos.distanceTo(approachPos) + approachPos.distanceTo(next.position)
      : startPos.distanceTo(next.position);
    const duration = initialDive ? initialDiveDuration(dist) : regularMoveDuration(dist);
    tweenRef.current = {
      startPos,
      startLook,
      endPos: next.position.clone(),
      endLook: next.lookAt.clone(),
      approachPos,
      holdAngleUntil,
      initialDive,
      startAt: performance.now(),
      duration,
    };

  }, [step, sceneItems]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = Math.max(1, Math.floor(sizeRef.current.w));
    const height = Math.max(1, Math.floor(sizeRef.current.h));
    const maxHeight = Math.max(...sceneItems.map((it) => it.height), 1);
    const spanZ = Math.abs(sceneItems.length * STEP_Z) + 200;
    const farPlane = Math.min(1_000_000, Math.max(6000, maxHeight * 6, spanZ * 4));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e8eef7");
    scene.fog = new THREE.Fog(0xdfe6f2, Math.max(120, maxHeight * 0.35), Math.max(1600, Math.min(300_000, maxHeight * 3.2)));

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
    key.shadow.camera.far = Math.min(20_000, Math.max(1200, maxHeight * 0.8));
    const shadowSpan = Math.min(2_000, Math.max(180, sceneItems.length * STEP_X + 200));
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
    const rim = new THREE.DirectionalLight(safeColor(config.accentColor), 0.35);
    rim.position.set(0, 40, 220);
    scene.add(rim);

    buildScene(scene, sceneItems, config, urls);

    rendererRef.current = renderer;
    cameraRef.current = camera;
    sceneRef.current = scene;

    let raf = 0;

    const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const smoothstep = (t: number) => t * t * (3 - 2 * t);

    const render = () => {
      const tween = tweenRef.current;
      if (tween) {
        const raw = (performance.now() - tween.startAt) / tween.duration;
        const t = raw >= 1 ? 1 : raw <= 0 ? 0 : raw;
        // Opening descent: travel first toward a bird's-eye approach point over
        // the first bar, then only in the final beat settle into the front view.
        // This creates the feeling of a distant point growing smoothly, instead
        // of bars popping in while the camera is forced to finish too quickly.
        if (tween.initialDive && tween.approachPos) {
          if (t < tween.holdAngleUntil) {
            const diveT = easeInOut(t / tween.holdAngleUntil);
            posRef.current.lerpVectors(tween.startPos, tween.approachPos, diveT);
          } else {
            const settleT = easeInOut((t - tween.holdAngleUntil) / Math.max(0.01, 1 - tween.holdAngleUntil));
            posRef.current.lerpVectors(tween.approachPos, tween.endPos, settleT);
          }
        } else {
          const posT = easeInOut(t);
          posRef.current.lerpVectors(tween.startPos, tween.endPos, posT);
        }
        // Interpolate the VIEW DIRECTION, not the absolute lookAt point. During
        // the opening dive this keeps the exact bird's-eye angle while the
        // camera descends, preventing the tallest bar from visually flipping
        // from upper-right to lower-right before the first-bar framing takes over.
        const startDir = tween.startLook.clone().sub(tween.startPos).normalize();
        const endDir = tween.endLook.clone().sub(tween.endPos).normalize();
        const lookRaw = Math.max(0, (t - tween.holdAngleUntil) / Math.max(0.01, 1 - tween.holdAngleUntil));
        const lookT = smoothstep(lookRaw);
        const dir = startDir.lerp(endDir, lookT).normalize();
        lookRef.current.copy(posRef.current).addScaledVector(dir, 100);
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

  // --- Altitude reference bands & flat city skyline (motion parallax) ------
  const maxHeight = Math.max(...sceneItems.map((it) => it.height), 1);
  addAltitudeReferences(scene, sceneItems, maxHeight, midX, midZ, spanX);
  addCitySkyline(scene, sceneItems, maxHeight, midX, midZ);


  // --- Bars -----------------------------------------------------------------
  sceneItems.forEach((item) => {
    const color = safeColor(item.color);
    // Horizontal ruler bands tile vertically on the bar sides — every 2 world
    // units — so vertical camera travel reads clearly on tall bars.
    const bandMap = makeBandTexture();
    bandMap.repeat.set(1, Math.max(1, item.height / 2));
    const barMat = new THREE.MeshStandardMaterial({
      color,
      map: bandMap,
      roughness: 0.55,
      metalness: 0.15,
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

    // Every 10 world units, a stronger accent ring wraps around the bar so
    // the camera clearly "passes" reference marks on the way up.
      const majorEvery = chooseMajorStep(item.height);
      const majorCount = Math.min(MAX_MAJOR_RINGS_PER_BAR, Math.floor(item.height / majorEvery));
    for (let i = 1; i <= majorCount; i++) {
      const ringY = i * majorEvery;
      const ring = new THREE.Mesh(
        new THREE.BoxGeometry(BAR_WIDTH + 0.06, 0.12, BAR_DEPTH + 0.06),
        new THREE.MeshBasicMaterial({
          color: safeColor(config.accentColor),
          transparent: true,
          opacity: 0.55,
        }),
      );
      ring.position.set(item.position.x, ringY, item.position.z);
      scene.add(ring);
    }

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
    const frameGeo = new THREE.PlaneGeometry(PANEL_SIZE + 0.18, PANEL_SIZE + 0.18);
    const frameMat = new THREE.MeshBasicMaterial({
      color: safeColor(item.color),
      transparent: true,
      opacity: 0.95,
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.copy(item.panelCenter);
    frame.position.z -= 0.005;
    scene.add(frame);

    // --- Big square photo sitting ON TOP of the pedestal -------------------
    // This is the signature look of viral 3D comparison videos.
    const topTexture = makeTopImageTexture(item, urls[item.node.id] ?? null);
    const topMat = new THREE.MeshBasicMaterial({
      map: topTexture,
      transparent: true,
      toneMapped: false,
    });
    const topGeo = new THREE.PlaneGeometry(TOP_IMAGE_SIZE, TOP_IMAGE_SIZE);
    const top = new THREE.Mesh(topGeo, topMat);
    // Face the camera direction (looking down the row) so it reads from front.
    top.position.set(
      item.position.x,
      item.height + TOP_IMAGE_LIFT + TOP_IMAGE_SIZE / 2,
      item.position.z + BAR_DEPTH / 2 - 0.4,
    );
    top.rotation.y = 0;
    scene.add(top);

    // Small colored base plate under the top image (echoes the bar color).
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(TOP_IMAGE_SIZE * 0.95, 0.35, TOP_IMAGE_SIZE * 0.55),
      new THREE.MeshStandardMaterial({
        color: safeColor(item.color),
        roughness: 0.35,
        metalness: 0.4,
      }),
    );
    plate.position.set(item.position.x, item.height + 0.18, item.position.z);
    plate.castShadow = true;
    scene.add(plate);
  });
}

// Repeating horizontal-band texture used on every bar. White base with a
// dark line + light highlight per tile, multiplied by the bar's color.
function makeBandTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  // Dark band near the bottom of each tile.
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, 118, c.width, 4);
  // Highlight just above it.
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillRect(0, 114, c.width, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Wide, faint horizontal stripes floating far behind the row of bars, placed
// at meaningful altitudes so the camera clearly passes them on the way up.
function addAltitudeReferences(
  scene: THREE.Scene,
  sceneItems: SceneItem[],
  maxHeight: number,
  midX: number,
  midZ: number,
  spanX: number,
) {
  const bandZ = midZ - Math.max(240, Math.abs(sceneItems.length * STEP_Z) + 200);
  const bandWidth = spanX * 1.6;
  const altitudes: number[] = [];
  // Log-ish progression so short and tall bars both get several bands.
  for (let a = 5; a <= maxHeight * 1.1 && altitudes.length < MAX_ALTITUDE_BANDS; a *= 1.6) altitudes.push(Math.round(a));
  altitudes.forEach((h) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(bandWidth, 0.6),
      new THREE.MeshBasicMaterial({
        color: 0x94a3b8,
        transparent: true,
        opacity: 0.35,
      }),
    );
    mesh.position.set(midX, h, bandZ);
    scene.add(mesh);
  });
}

// Flat 2D city silhouette behind the scene — one merged skyline block with
// window cutouts. Purely 2D backdrop for a clean, professional look.
function addCitySkyline(
  scene: THREE.Scene,
  sceneItems: SceneItem[],
  maxHeight: number,
  midX: number,
  midZ: number,
) {
  const spanZ = Math.abs(sceneItems.length * STEP_Z);
  const backZ = midZ - Math.max(320, spanZ + 260);
  const width = Math.max(1800, sceneItems.length * STEP_X * 6 + 1200);
  const height = Math.max(90, Math.min(maxHeight * 0.42, 340));
  const tex = makeCityTexture(width, height);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      fog: true,
    }),
  );
  mesh.position.set(midX, height / 2, backZ);
  mesh.renderOrder = -1;
  scene.add(mesh);
}

function makeCityTexture(worldW: number, worldH: number): THREE.CanvasTexture {
  const pxW = 2048;
  const ratio = Math.max(0.04, Math.min(0.6, worldH / worldW));
  const pxH = Math.max(128, Math.round(pxW * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, pxW, pxH);

  // Deterministic building block layout.
  let seed = 91;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  type B = { x: number; w: number; h: number; roof: "flat" | "step" | "peak" };
  const buildings: B[] = [];
  let x = -20;
  while (x < pxW + 20) {
    const w = 46 + Math.round(rand() * 120);
    const h = Math.round(pxH * (0.32 + rand() * 0.68));
    const r = rand();
    const roof: B["roof"] = r < 0.55 ? "flat" : r < 0.85 ? "step" : "peak";
    buildings.push({ x, w, h, roof });
    x += w - 1; // slight overlap so silhouette merges into one block
  }

  ctx.fillStyle = "#b8c2d3";
  for (const b of buildings) {
    const top = pxH - b.h;
    ctx.fillRect(b.x, top, b.w, b.h);
    if (b.roof === "step") {
      const sw = Math.round(b.w * 0.55);
      const sh = Math.round(b.h * 0.12);
      ctx.fillRect(b.x + Math.round((b.w - sw) / 2), top - sh, sw, sh);
    } else if (b.roof === "peak") {
      const pw = Math.round(b.w * 0.22);
      const ph = Math.round(b.h * 0.18);
      ctx.fillRect(b.x + Math.round((b.w - pw) / 2), top - ph, pw, ph);
    }
  }

  // Punch out windows so they render as transparent holes over the sky.
  ctx.globalCompositeOperation = "destination-out";
  for (const b of buildings) {
    const winW = 5;
    const winH = 8;
    const gapX = 9;
    const gapY = 13;
    const padX = 6;
    const padTop = 16;
    const padBottom = 8;
    const cols = Math.floor((b.w - padX * 2) / (winW + gapX));
    const rows = Math.floor((b.h - padTop - padBottom) / (winH + gapY));
    if (cols <= 0 || rows <= 0) continue;
    const top = pxH - b.h;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        // Skip a few windows randomly for texture.
        if (((c * 31 + r * 17 + b.x) % 11) === 0) continue;
        const wx = b.x + padX + c * (winW + gapX);
        const wy = top + padTop + r * (winH + gapY);
        ctx.fillRect(wx, wy, winW, winH);
      }
    }
  }
  ctx.globalCompositeOperation = "source-over";

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
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
  _img: HTMLImageElement | null,
  config: ReturnType<typeof parseScaleConfig>,
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);

  const barColor = item.color;

  // Panel background — dark card with a strong colored top strip.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b1220");
  bg.addColorStop(1, "#111c33");
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 44);
  ctx.fill();

  // Colored header strip (bar color) — instantly ties the panel to the pedestal.
  ctx.fillStyle = barColor;
  roundRect(ctx, 0, 0, W, 260, 44);
  ctx.fill();
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 220, W, 40);

  // Rank chip (top-left, on the colored header).
  ctx.fillStyle = "#0b1220";
  roundRect(ctx, 40, 40, 170, 90, 45);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 68px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`#${item.index + 1}`, 40 + 85, 40 + 45);

  // Name on the header (right of rank chip).
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  fitTextLeft(ctx, item.node.text || "", 240, 85, W - 280, 88, 900);

  // Value — the HERO number. Massive, centered, colored.
  ctx.fillStyle = barColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const valSize = fitTextCenter(ctx, formatValue(item.value), W / 2, H * 0.58, W - 100, 260, 900);

  // Unit below the value.
  const unit = item.data.unit || config.unit;
  if (unit) {
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 72px system-ui, sans-serif";
    ctx.fillText(unit, W / 2, H * 0.58 + valSize * 0.7);
  }

  // Bottom accent bar in the item's color.
  ctx.fillStyle = barColor;
  roundRect(ctx, 40, H - 60, W - 80, 20, 10);
  ctx.fill();
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

function fitTextCenter(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, maxWidth: number, startSize: number, weight = 700,
): number {
  let size = startSize;
  ctx.font = `${weight} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  while (size > 40 && ctx.measureText(text).width > maxWidth) {
    size -= 6;
    ctx.font = `${weight} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  }
  ctx.fillText(text, x, y);
  return size;
}

function fitTextLeft(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, maxWidth: number, startSize: number, weight = 700,
) {
  let size = startSize;
  ctx.font = `${weight} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  while (size > 28 && ctx.measureText(text).width > maxWidth) {
    size -= 4;
    ctx.font = `${weight} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  }
  ctx.fillText(text, x, y);
}

// Big square photo texture that floats on top of the bar. Transparent
// background so a rounded card + accent halo read against the sky.
function makeTopImageTexture(item: SceneItem, url: string | null): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  drawTopImage(ctx, item, null);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (url) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try { drawTopImage(ctx, item, img); tex.needsUpdate = true; } catch { /* tainted */ }
    };
    img.onerror = () => { /* keep placeholder */ };
    img.src = url;
  }
  return tex;
}

function drawTopImage(
  ctx: CanvasRenderingContext2D,
  item: SceneItem,
  img: HTMLImageElement | null,
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);

  const color = item.color;
  const pad = 30;

  // Soft colored glow behind the card.
  const grad = ctx.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.55);
  grad.addColorStop(0, hexWithAlpha(color, 0.55));
  grad.addColorStop(1, hexWithAlpha(color, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Colored border card.
  ctx.fillStyle = color;
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 48);
  ctx.fill();

  // Inner white card that holds the photo.
  const inner = 22;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, pad + inner, pad + inner, W - (pad + inner) * 2, H - (pad + inner) * 2, 34);
  ctx.fill();

  ctx.save();
  const ix = pad + inner + 6;
  const iy = pad + inner + 6;
  const iw = W - (ix) * 2;
  const ih = H - (iy) * 2;
  roundRect(ctx, ix, iy, iw, ih, 28);
  ctx.clip();
  if (img && img.width > 0 && img.height > 0) {
    const ir = img.width / img.height;
    const br = iw / ih;
    let dw: number, dh: number, dx: number, dy: number;
    if (ir > br) { dh = ih; dw = dh * ir; dx = ix - (dw - iw) / 2; dy = iy; }
    else { dw = iw; dh = dw / ir; dx = ix; dy = iy - (dh - ih) / 2; }
    ctx.drawImage(img, dx, dy, dw, dh);
  } else {
    ctx.fillStyle = hexWithAlpha(color, 0.18);
    ctx.fillRect(ix, iy, iw, ih);
    ctx.fillStyle = color;
    ctx.font = "900 420px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((item.node.text || "?").slice(0, 1).toUpperCase(), W / 2, H / 2);
  }
  ctx.restore();
}

function hexWithAlpha(hex: string, alpha: number): string {
  const c = new THREE.Color(hex);
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `rgba(${r},${g},${b},${alpha})`;
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

  // Opening frame: high-angle "bird's eye" over the tallest bar, tilted
  // strongly downward. Composition: the bar's top image sits in the upper-
  // right of the frame while the rest of the image opens down-left toward
  // the ground, giving a real sense of altitude.
  if (step.kind === "overview") {
    const tallest = sceneItems.reduce((a, b) => (b.height > a.height ? b : a), sceneItems[0]);
    const topY = tallest.height + TOP_IMAGE_LIFT + TOP_IMAGE_SIZE / 2;
    const up = TOP_IMAGE_SIZE * 2.6;
    // Place the camera BEHIND the subject in Z (further +Z than the bar) so
    // that, with the near top-down tilt, the subject projects into the UPPER
    // portion of the frame and the ground opens up toward the lower-left.
    const backOffset = TOP_IMAGE_SIZE * 2.2;
    return {
      position: new THREE.Vector3(
        tallest.position.x + STEP_X * 0.25,
        topY + up,
        tallest.position.z + backOffset,
      ),
      // Aim forward (-Z) and to the LEFT of the subject, well below it, so the
      // top image lands in the upper-right corner and the ground fills the
      // lower-left area of the frame.
      lookAt: new THREE.Vector3(
        tallest.position.x - STEP_X * 2.6,
        Math.max(-TOP_IMAGE_SIZE * 4, topY - TOP_IMAGE_SIZE * 9),
        tallest.position.z - Math.abs(STEP_Z) * 3.0,
      ),
    };
  }



  // Focus on a specific bar — pulled back enough to fit BOTH the front panel
  // and the big top image in frame together.
  const idx = Math.max(0, Math.min(sceneItems.length - 1, step.index));
  const current = sceneItems[idx];
  const next = sceneItems[idx + 1];

  // Frame spans from the bottom of the panel up to the top of the head image.
  const panelBottomY = current.panelCenter.y - PANEL_SIZE / 2;
  const topImageTopY = current.height + TOP_IMAGE_LIFT + TOP_IMAGE_SIZE;
  const frameHeight = (topImageTopY - panelBottomY) * 1.15; // small breathing room
  const frameWidth = Math.max(PANEL_SIZE, TOP_IMAGE_SIZE) * 1.25;
  const centerY = (panelBottomY + topImageTopY) / 2;

  const distV = (frameHeight / 2) / Math.tan(verticalFov / 2);
  const distH = (frameWidth / 2) / Math.tan(horizontalFov / 2);
  const distance = Math.max(distV, distH);

  // Push the camera slightly along the travel direction (toward next bar)
  // and to the "outside" of the diagonal so the previous bars line up in frame.
  const forward = new THREE.Vector3(0, 0, 1); // panels face +Z
  const travel = next
    ? new THREE.Vector3(next.position.x - current.position.x, 0, next.position.z - current.position.z).normalize()
    : new THREE.Vector3(STEP_X, 0, STEP_Z).normalize();

  const lateral = 2.6;

  const pos = new THREE.Vector3(current.panelCenter.x, centerY, current.panelCenter.z)
    .addScaledVector(forward, distance)
    .addScaledVector(travel, lateral);

  const look = new THREE.Vector3(current.panelCenter.x, centerY, current.panelCenter.z);

  return { position: pos, lookAt: look };
}


// ============================================================================
// Helpers
// ============================================================================

function safeColor(value: string) {
  try { return new THREE.Color(value); }
  catch { return new THREE.Color("#38bdf8"); }
}

function compressWorldHeight(rawHeight: number): number {
  if (!Number.isFinite(rawHeight) || rawHeight <= 0) return MIN_BAR_HEIGHT;
  if (rawHeight <= MAX_WORLD_BAR_HEIGHT) return rawHeight;
  const overflow = rawHeight / MAX_WORLD_BAR_HEIGHT;
  return MAX_WORLD_BAR_HEIGHT * (1 + Math.log10(overflow + 1) * 0.18);
}

function chooseMajorStep(height: number): number {
  if (!Number.isFinite(height) || height <= 0) return 10;
  return Math.max(10, Math.ceil(height / MAX_MAJOR_RINGS_PER_BAR));
}
