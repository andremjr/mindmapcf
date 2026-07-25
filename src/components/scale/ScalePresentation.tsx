import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { MindNode, Project } from "@/lib/types";
import { resolveImage } from "@/lib/imageStorage";
import { PresentationShell } from "@/components/shared/PresentationShell";
import { AvatarLayer } from "@/components/shared/AvatarLayer";
import { formatValue, parseItemData, parseScaleConfig } from "@/lib/scaleConfig";
import { orderItems } from "./ScaleEditor";

const BAR_WIDTH = 2.15;
const BAR_DEPTH = 1.55;
const BAR_SPACING = 5.6;
const WORLD_MAX_HEIGHT = 820;
const CAMERA_FOV = 42;

type ScaleStep = { kind: "empty" } | { kind: "focus"; index: number };

type SceneItem = {
  node: MindNode;
  data: ReturnType<typeof parseItemData>;
  x: number;
  height: number;
  value: number;
  color: string;
};

type OverlayPoint = {
  id: string;
  x: number;
  y: number;
  visible: boolean;
};

type CameraTarget = {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
};

function useResolvedImage(node: MindNode | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const key = node?.imageRef?.id ?? node?.image ?? "";
  useEffect(() => {
    if (!node) { setUrl(null); return; }
    if (node.image) { setUrl(node.image); return; }
    if (!node.imageRef) { setUrl(null); return; }
    let alive = true;
    resolveImage(node.imageRef).then((u) => alive && setUrl(u));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

export function ScalePresentation({ project, recording }: { project: Project; recording: boolean }) {
  const rootNode = project.nodes.find((n) => n.role === "scale" || !n.parentId);
  const items = useMemo(
    () => project.nodes.filter((n) => n.role === "item" && n.parentId === rootNode?.id),
    [project.nodes, rootNode?.id],
  );
  const config = useMemo(() => parseScaleConfig(rootNode?.body), [rootNode?.body]);
  const ordered = useMemo(() => orderItems(items, config.sortMode), [items, config.sortMode]);
  const steps: ScaleStep[] = useMemo(
    () => ordered.length ? ordered.map((_, index) => ({ kind: "focus", index })) : [{ kind: "empty" }],
    [ordered],
  );
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (stepIdx >= steps.length) setStepIdx(Math.max(0, steps.length - 1));
  }, [stepIdx, steps.length]);

  const active = steps[stepIdx] ?? { kind: "empty" };
  const focusIndex = active.kind === "focus" ? active.index : null;

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
          focusIndex={focusIndex}
          project={project}
        />
      )}
    </PresentationShell>
  );
}

function ScaleFrame({
  size, items, config, focusIndex, project,
}: {
  size: { w: number; h: number };
  items: MindNode[];
  config: ReturnType<typeof parseScaleConfig>;
  focusIndex: number | null;
  project: Project;
}) {
  const sceneItems = useMemo<SceneItem[]>(() => {
    const parsed = items.map((node) => ({ node, data: parseItemData(node.body) }));
    const positives = parsed
      .map((item) => Number.isFinite(item.data.value) ? Math.max(0, item.data.value) : 0)
      .filter((value) => value > 0);
    const maxValue = positives.length ? Math.max(...positives) : 1;
    const mid = (parsed.length - 1) / 2;

    return parsed.map((item, index) => {
      const value = Number.isFinite(item.data.value) ? Math.max(0, item.data.value) : 0;
      return {
        node: item.node,
        data: item.data,
        x: (index - mid) * BAR_SPACING,
        height: value > 0 ? Math.max(0.0001, (value / maxValue) * WORLD_MAX_HEIGHT) : 0.12,
        value,
        color: item.node.color ?? config.barColor,
      };
    });
  }, [config.barColor, items]);

  const focusItem = focusIndex != null ? sceneItems[focusIndex] : null;
  const previousItem = focusIndex != null && focusIndex > 0 ? sceneItems[focusIndex - 1] : null;
  const ratioLabel = focusItem && previousItem && previousItem.value > 0 && focusItem.value > 0
    ? focusItem.value / previousItem.value
    : null;

  return (
    <div className="absolute inset-0 overflow-hidden bg-background">
      <div
        className="absolute inset-0"
        style={{
          background:
            `radial-gradient(circle at 50% 6%, ${mix(config.accentColor, "#020617", 0.78)} 0%, #020617 42%, #050816 100%)`,
        }}
      />
      <div className="absolute inset-0 opacity-40 scale-grid-mask" />

      {sceneItems.length ? (
        <ScaleThreeScene
          size={size}
          sceneItems={sceneItems}
          config={config}
          focusIndex={focusIndex}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-muted-foreground">
          Adicione itens para apresentar a comparação.
        </div>
      )}

      {focusItem && (
        <div
          className="absolute left-7 bottom-24 max-w-[42%] p-5 rounded-xl border backdrop-blur-md bg-background/70 animate-fade-in"
          style={{
            borderColor: config.accentColor,
            boxShadow: `0 24px 80px ${config.accentColor}33`,
          }}
        >
          <div className="text-[11px] uppercase tracking-widest" style={{ color: config.accentColor }}>
            Comparação em escala real
          </div>
          <div className="text-3xl md:text-4xl font-black leading-tight text-foreground mt-1">
            {focusItem.node.text}
          </div>
          <div className="mt-2 text-foreground">
            <span className="text-4xl md:text-5xl font-black" style={{ color: config.accentColor }}>
              {formatValue(focusItem.data.value)}
            </span>
            <span className="ml-2 text-lg opacity-90">{focusItem.data.unit || config.unit}</span>
          </div>
          {previousItem && ratioLabel && Number.isFinite(ratioLabel) && (
            <div className="mt-2 text-sm text-foreground/85">
              {ratioLabel >= 1
                ? <>≈ <b>{ratioLabel.toLocaleString("pt-BR", { maximumFractionDigits: ratioLabel >= 10 ? 0 : 1 })}×</b> a de <i>{previousItem.node.text}</i></>
                : <>≈ <b>{(1 / ratioLabel).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}× menor</b> que <i>{previousItem.node.text}</i></>}
            </div>
          )}
          {focusItem.data.note && (
            <p className="mt-3 text-sm md:text-base text-foreground/85 leading-relaxed whitespace-pre-wrap">
              {focusItem.data.note}
            </p>
          )}
        </div>
      )}

      <div className="absolute inset-x-0 top-5 flex justify-center pointer-events-none">
        <div className="px-4 py-2 rounded-full bg-background/55 backdrop-blur text-foreground/85 text-sm border border-border">
          {config.caption || "Uma comparação em escala."}
        </div>
      </div>

      <AvatarLayer project={project} frameSize={size} />
    </div>
  );
}

function ScaleThreeScene({
  size, sceneItems, config, focusIndex,
}: {
  size: { w: number; h: number };
  sceneItems: SceneItem[];
  config: ReturnType<typeof parseScaleConfig>;
  focusIndex: number | null;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const lookRef = useRef(new THREE.Vector3(0, 0, 0));
  const targetRef = useRef<CameraTarget | null>(null);
  const sizeRef = useRef(size);
  const itemsRef = useRef(sceneItems);
  const [overlay, setOverlay] = useState<OverlayPoint[]>([]);

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

  useEffect(() => {
    itemsRef.current = sceneItems;
  }, [sceneItems]);

  useEffect(() => {
    targetRef.current = computeCameraTarget(sceneItems, focusIndex, size.w / Math.max(1, size.h));
  }, [focusIndex, sceneItems, size.h, size.w]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = Math.max(1, Math.floor(sizeRef.current.w));
    const height = Math.max(1, Math.floor(sizeRef.current.h));
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050816, 80, 2400);

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, 0.001, 50000);
    const initialTarget = computeCameraTarget(sceneItems, focusIndex, width / height);
    camera.position.copy(initialTarget.position);
    camera.lookAt(initialTarget.lookAt);
    lookRef.current.copy(initialTarget.lookAt);
    targetRef.current = initialTarget;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(0xe8f3ff, 0x0a1020, 1.05);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 2.8);
    key.position.set(-18, 34, 28);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 2600;
    key.shadow.camera.left = -80;
    key.shadow.camera.right = 80;
    key.shadow.camera.top = 1200;
    key.shadow.camera.bottom = -80;
    scene.add(key);

    const rim = new THREE.DirectionalLight(hexColor(config.accentColor), 2.1);
    rim.position.set(26, 18, -32);
    scene.add(rim);

    buildWorld(scene, sceneItems, config);

    rendererRef.current = renderer;
    cameraRef.current = camera;
    sceneRef.current = scene;

    let raf = 0;
    const clock = new THREE.Clock();
    const projected = new THREE.Vector3();
    const top = new THREE.Vector3();

    const render = () => {
      const dt = Math.min(0.05, clock.getDelta());
      const currentTarget = targetRef.current;
      if (currentTarget) {
        const smooth = 1 - Math.exp(-dt * 1.45);
        camera.position.lerp(currentTarget.position, smooth);
        lookRef.current.lerp(currentTarget.lookAt, smooth);
        camera.lookAt(lookRef.current);
      }

      renderer.render(scene, camera);

      const frame = sizeRef.current;
      const nextOverlay = itemsRef.current.map((item) => {
        top.set(item.x, item.height + Math.max(0.45, item.height * 0.018), 0);
        projected.copy(top).project(camera);
        return {
          id: item.node.id,
          x: (projected.x * 0.5 + 0.5) * frame.w,
          y: (-projected.y * 0.5 + 0.5) * frame.h,
          visible: projected.z > -1 && projected.z < 1,
        };
      });
      setOverlay(nextOverlay);

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      rendererRef.current = null;
      cameraRef.current = null;
      sceneRef.current = null;
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [config, sceneItems]);

  const overlayById = useMemo(() => new Map(overlay.map((point) => [point.id, point])), [overlay]);

  return (
    <>
      <div ref={mountRef} className="absolute inset-0" />
      <div className="absolute inset-0 pointer-events-none select-none">
        {sceneItems.map((item, index) => {
          const point = overlayById.get(item.node.id);
          if (!point || !point.visible) return null;
          const isActive = focusIndex === index;
          const isPrevious = focusIndex != null && index === focusIndex - 1;
          const isContext = focusIndex == null || isActive || isPrevious;
          return (
            <ScaleHeadOverlay
              key={item.node.id}
              item={item}
              point={point}
              active={isActive}
              previous={isPrevious}
              muted={!isContext}
              accent={config.accentColor}
              unit={item.data.unit || config.unit}
            />
          );
        })}
      </div>
    </>
  );
}

function buildWorld(scene: THREE.Scene, sceneItems: SceneItem[], config: ReturnType<typeof parseScaleConfig>) {
  const minX = sceneItems.length ? Math.min(...sceneItems.map((item) => item.x)) - 18 : -24;
  const maxX = sceneItems.length ? Math.max(...sceneItems.map((item) => item.x)) + 18 : 24;
  const floorWidth = Math.max(80, maxX - minX);
  const floorGeometry = new THREE.PlaneGeometry(floorWidth, 52, 1, 1);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: hexColor(mix(config.barColor, "#020617", 0.84)),
    metalness: 0.15,
    roughness: 0.72,
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((minX + maxX) / 2, -0.012, 0);
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(floorWidth, Math.max(12, Math.round(floorWidth / 4)), hexColor(config.accentColor), 0x263244);
  grid.position.set((minX + maxX) / 2, 0.006, 0);
  const gridMaterial = grid.material;
  if (Array.isArray(gridMaterial)) gridMaterial.forEach((material) => {
    material.transparent = true;
    material.opacity = 0.24;
  });
  else {
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.24;
  }
  scene.add(grid);

  sceneItems.forEach((item) => {
    const color = new THREE.Color(item.color);
    const side = color.clone().lerp(new THREE.Color(0x020617), 0.25);
    const highlight = color.clone().lerp(new THREE.Color(0xffffff), 0.18);

    const geometry = new THREE.BoxGeometry(BAR_WIDTH, item.height, BAR_DEPTH);
    const material = new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.22,
      roughness: 0.36,
      clearcoat: 0.35,
      clearcoatRoughness: 0.5,
      emissive: side,
      emissiveIntensity: 0.06,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(item.x, item.height / 2, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const topGeometry = new THREE.BoxGeometry(BAR_WIDTH * 1.08, Math.max(0.055, item.height * 0.002), BAR_DEPTH * 1.08);
    const topMaterial = new THREE.MeshStandardMaterial({
      color: highlight,
      metalness: 0.18,
      roughness: 0.3,
      emissive: hexColor(config.accentColor),
      emissiveIntensity: 0.08,
    });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.set(item.x, item.height + Math.max(0.028, item.height * 0.001), 0);
    top.castShadow = true;
    scene.add(top);

    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edges.position.copy(mesh.position);
    scene.add(edges);

    const baseGeometry = new THREE.CylinderGeometry(BAR_WIDTH * 0.78, BAR_WIDTH * 1.05, 0.08, 32);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: hexColor(mix(config.accentColor, "#020617", 0.55)),
      metalness: 0.3,
      roughness: 0.4,
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.scale.z = BAR_DEPTH / BAR_WIDTH;
    base.position.set(item.x, 0.04, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    scene.add(base);
  });
}

function computeCameraTarget(sceneItems: SceneItem[], focusIndex: number | null, aspect: number): CameraTarget {
  if (!sceneItems.length) {
    return {
      position: new THREE.Vector3(0, 8, 18),
      lookAt: new THREE.Vector3(0, 3, 0),
    };
  }

  const verticalFov = THREE.MathUtils.degToRad(CAMERA_FOV);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(0.1, aspect));

  if (focusIndex == null) {
    const minX = Math.min(...sceneItems.map((item) => item.x)) - BAR_WIDTH * 1.8;
    const maxX = Math.max(...sceneItems.map((item) => item.x)) + BAR_WIDTH * 1.8;
    const maxH = Math.max(...sceneItems.map((item) => item.height), 1);
    const centerX = (minX + maxX) / 2;
    const width = Math.max(maxX - minX, BAR_WIDTH * 4);
    const distanceV = maxH / (2 * Math.tan(verticalFov / 2) * 0.55);
    const distanceH = width / (2 * Math.tan(horizontalFov / 2) * 0.62);
    const distance = Math.max(distanceV, distanceH, 16);
    return {
      position: new THREE.Vector3(centerX, maxH * 0.44, distance),
      lookAt: new THREE.Vector3(centerX, maxH * 0.4, 0),
    };
  }

  const current = sceneItems[focusIndex] ?? sceneItems[0];
  const previous = focusIndex > 0 ? sceneItems[focusIndex - 1] : null;
  const pair = previous ? [previous, current] : [current];
  const minX = Math.min(...pair.map((item) => item.x)) - BAR_WIDTH * 2.1;
  const maxX = Math.max(...pair.map((item) => item.x)) + BAR_WIDTH * 2.1;
  const maxH = Math.max(...pair.map((item) => item.height), 0.4);
  const minPairH = Math.max(0.0001, Math.min(...pair.map((item) => item.height).filter((height) => height > 0)));
  const ratio = maxH / minPairH;
  const width = Math.max(maxX - minX, BAR_WIDTH * 4.2);
  const centerX = previous ? (previous.x * 0.38 + current.x * 0.62) : current.x;
  const lookY = ratio > 90 ? maxH * 0.66 : maxH * 0.42;
  const distanceV = maxH / (2 * Math.tan(verticalFov / 2) * 0.64);
  const distanceH = width / (2 * Math.tan(horizontalFov / 2) * 0.56);
  const distance = Math.max(distanceV, distanceH, 6.5);

  return {
    position: new THREE.Vector3(centerX, lookY + maxH * 0.04, distance),
    lookAt: new THREE.Vector3(centerX, lookY, 0),
  };
}

function ScaleHeadOverlay({
  item, point, active, previous, muted, accent, unit,
}: {
  item: SceneItem;
  point: OverlayPoint;
  active: boolean;
  previous: boolean;
  muted: boolean;
  accent: string;
  unit: string;
}) {
  const url = useResolvedImage(item.node);
  const size = active ? 118 : previous ? 88 : 62;
  const opacity = muted ? 0.22 : previous ? 0.76 : 1;

  return (
    <div
      className="absolute flex flex-col items-center"
      style={{
        left: point.x,
        top: point.y,
        transform: "translate(-50%, -100%)",
        opacity,
        transition: "opacity 500ms ease",
        zIndex: active ? 4 : previous ? 3 : 1,
      }}
    >
      <div
        className="rounded-full overflow-hidden bg-muted grid place-items-center font-black text-muted-foreground"
        style={{
          width: size,
          height: size,
          border: `3px solid ${active ? accent : previous ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.3)"}`,
          boxShadow: active ? `0 16px 60px ${accent}aa` : "0 10px 28px rgba(0,0,0,0.45)",
        }}
      >
        {url ? (
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <span style={{ fontSize: Math.max(18, size * 0.36) }}>{(item.node.text || "?").slice(0, 1).toUpperCase()}</span>
        )}
      </div>
      <div
        className="mt-2 text-center rounded-md px-3 py-1 bg-background/72 backdrop-blur border border-border text-foreground shadow-lg"
        style={{ maxWidth: active ? 260 : 190 }}
      >
        <div className="text-sm font-bold leading-tight truncate">{item.node.text}</div>
        <div className="text-xs text-foreground/75 tabular-nums">
          {formatValue(item.data.value)} {unit}
        </div>
      </div>
    </div>
  );
}

function hexColor(value: string) {
  try { return new THREE.Color(value); }
  catch { return new THREE.Color("#38bdf8"); }
}

function mix(a: string, b: string, t: number): string {
  const ca = safeRgb(a);
  const cb = safeRgb(b);
  if (!ca || !cb) return a;
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function safeRgb(value: string) {
  try {
    const color = new THREE.Color(value);
    return { r: color.r * 255, g: color.g * 255, b: color.b * 255 };
  } catch {
    return null;
  }
}