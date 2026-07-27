import { create } from "zustand";
import type { Folder, ImageRef, MindNode, Project, ProjectTemplate, SonicAvatarEntry, SonicAvatarUsage } from "./types";
import { buildColorMap } from "./nodeColors";


function uid(_prefix = "id") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${_prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

interface State {
  projects: Project[];
  avatars: SonicAvatarEntry[];
  folders: Folder[];
}

interface Actions {
  hydrate: (projects: Project[]) => void;
  reset: () => void;
  createProject: (title: string, folderId?: string | null, template?: ProjectTemplate) => string;
  importProject: (project: Project) => string;
  replaceProjectNodes: (projectId: string, nodes: MindNode[], title?: string) => void;
  /** Set nodes verbatim (no reflow, no viewport reset) — used by undo/redo. */
  setProjectNodes: (projectId: string, nodes: MindNode[]) => void;

  deleteProject: (id: string) => void;
  renameProject: (id: string, title: string) => void;
  setIcebergAtmosphere: (id: string, atmosphere: "ludico" | "realista" | "ultra") => void;
  moveProjectToFolder: (projectId: string, folderId: string | null) => void;

  // Folders
  hydrateFolders: (folders: Folder[]) => void;
  createFolder: (name: string, color?: string | null) => string;
  renameFolder: (id: string, name: string) => void;
  setFolderColor: (id: string, color: string | null) => void;
  deleteFolder: (id: string) => void;

  addNode: (
    projectId: string,
    node?: Partial<MindNode> & { parentId?: string | null },
  ) => string;
  updateNode: (projectId: string, nodeId: string, patch: Partial<MindNode>) => void;
  /** Move many nodes at once by (dx, dy) without triggering reflow. */
  moveNodes: (projectId: string, deltas: Array<{ id: string; dx: number; dy: number }>) => void;
  /** Delete node and all descendants. */
  deleteNode: (projectId: string, nodeId: string) => void;
  setParent: (projectId: string, nodeId: string, parentId: string | null) => void;
  toggleCollapsed: (projectId: string, nodeId: string) => void;
  /**
   * Set a node's accent color. When `cascade` is true, clears the `color`
   * from every descendant so the whole branch takes this color via
   * inheritance (see buildColorMap).
   */
  setNodeColor: (
    projectId: string,
    nodeId: string,
    color: string | undefined,
    cascade?: boolean,
  ) => void;
  autoLayout: (projectId: string) => void;

  setViewport: (projectId: string, v: { x: number; y: number; zoom: number }) => void;
  setSonicAvatar: (projectId: string, patch: Partial<SonicAvatarUsage> | null) => void;
  setNarration: (projectId: string, ref: ImageRef | null) => void;

  // Global user-scoped avatar library
  hydrateAvatars: (avatars: SonicAvatarEntry[]) => void;
  upsertAvatarLocal: (entry: SonicAvatarEntry) => void;
  removeAvatarLocal: (id: string) => void;
}


/** Base breathing room between a parent's right edge and its child's left edge. */
const H_GAP_BASE = 140;
/** Fallback horizontal offset (used only if widths cannot be measured). */
const H_GAP = 560;
const SIBLING_GAP = 36;

/**
 * Horizontal offset between the CENTER of a parent and the CENTER of a child,
 * proportional to both node widths so wide/media nodes get more breathing room
 * and short-text nodes sit closer together. Mimics common mind-map tools.
 */
function horizontalOffset(parentW: number, childW: number): number {
  return parentW / 2 + childW / 2 + H_GAP_BASE;
}
const BASE_NODE_H = 88;
const IMAGE_NODE_H = 190;
const LINE_H = 22;
const MIN_SLOT_H = 110;


/** Default card width used by NodeCard when node.width is not set. */
const DEFAULT_NODE_W = 520;
/** Horizontal padding inside the card (px-4 on both sides). */
const CARD_PAD_X = 32;

/**
 * Mirror of NodeCard's autoFontSize() — must stay in sync so the layout
 * engine estimates line-wrap using the SAME font size the card will render.
 */
function autoFontPx(text: string, isRoot: boolean): number {
  const len = (text || "").length;
  if (isRoot) {
    if (len < 40) return 18;
    if (len < 90) return 16;
    if (len < 160) return 14.4;
    return 13.1;
  }
  if (len < 60) return 16;
  if (len < 140) return 14.4;
  if (len < 240) return 13.1;
  if (len < 360) return 12;
  return 11.2;
}

/**
 * Adaptive node width — narrower for short text, wider for long text or when
 * the node carries media (media stays at consistent large size).
 * Explicit `n.width` overrides (reserved for future resize UI).
 */
export function nodeEffectiveWidth(n: MindNode): number {
  const isRoot = !n.parentId;
  const hasMedia = !!(n.imageRef || n.image);
  // Explicit width only counts for media nodes, or for text nodes the user
  // resized by hand (legacy default widths 520/560 are treated as "auto").
  if (typeof n.width === "number" && n.width > 0) {
    if (hasMedia) return n.width;
    if (n.width !== 520 && n.width !== 560) return n.width;
  }
  if (hasMedia) return isRoot ? 560 : 520;

  // Auto width: measure the text and shrink-wrap the card.
  const raw = (n.text || "").trim();
  if (!raw) return isRoot ? 160 : 120;

  const fontPx = autoFontPx(raw, isRoot);
  const charW = fontPx * 0.52;
  const minW = isRoot ? 140 : 100;
  const maxW = isRoot ? 560 : 520;

  const segments = raw.split(/\r?\n/);
  const longestLine = Math.max(...segments.map((s) => s.length));
  const longestWord = Math.max(
    ...raw.split(/\s+/).map((w) => w.length),
    1,
  );

  // Ideal single-line width for the longest explicit line.
  const naturalW = Math.ceil(longestLine * charW) + CARD_PAD_X;
  if (naturalW <= maxW) {
    return Math.min(maxW, Math.max(minW, naturalW));
  }

  // Text must wrap: pick a width that yields a balanced block instead of
  // always jumping to the maximum.
  const totalChars = raw.length;
  const targetLines = Math.ceil(Math.sqrt(totalChars / 9));
  const balancedW =
    Math.ceil((totalChars / Math.max(1, targetLines)) * charW) + CARD_PAD_X;
  const wordFloor = Math.ceil(longestWord * charW) + CARD_PAD_X;
  return Math.min(maxW, Math.max(minW, wordFloor, balancedW));
}


function nodeIntrinsicHeight(n: MindNode): number {
  const isRoot = !n.parentId;
  const fontPx = autoFontPx(n.text, isRoot);
  // Average glyph width ~0.52 of font-size for the app font.
  const charW = fontPx * 0.52;
  const lineH = Math.round(fontPx * 1.4);
  const w = nodeEffectiveWidth(n) - CARD_PAD_X;
  const charsPerLine = Math.max(10, Math.floor(w / charW));
  const raw = n.text || "";
  const segments = raw.split(/\r?\n/);
  let lines = 0;
  for (const seg of segments) {
    if (seg.length === 0) {
      lines += 1;
      continue;
    }
    const words = seg.split(/\s+/);
    let col = 0;
    let segLines = 1;
    for (const w0 of words) {
      const wlen = w0.length;
      if (col === 0) {
        col = wlen;
      } else if (col + 1 + wlen <= charsPerLine) {
        col += 1 + wlen;
      } else {
        segLines += 1;
        col = wlen;
      }
      while (col > charsPerLine) {
        segLines += 1;
        col -= charsPerLine;
      }
    }
    lines += segLines;
  }
  lines = Math.max(1, lines);
  const hasImage = !!(n.imageRef || n.image);
  // Base chrome (padding + first line) + image slot + extra lines.
  const base = 32 + lineH; // py-3 top+bottom (~24) + first line
  const imageH = hasImage ? 190 : 0;
  const h = base + imageH + Math.max(0, lines - 1) * lineH;
  return Math.max(96, h);
}


/** Descendants (excluding node itself). */
export function descendantIds(nodes: MindNode[], id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of nodes) {
      if (n.parentId === cur) {
        out.push(n.id);
        stack.push(n.id);
      }
    }
  }
  return out;
}

/** Would setting `parentId` on `nodeId` create a cycle? */
export function wouldCycle(
  nodes: MindNode[],
  nodeId: string,
  parentId: string | null,
): boolean {
  if (!parentId) return false;
  if (parentId === nodeId) return true;
  let cur: string | null = parentId;
  while (cur) {
    if (cur === nodeId) return true;
    const p = nodes.find((n) => n.id === cur);
    cur = p?.parentId ?? null;
  }
  return false;
}

/** Depth-first traversal (skipping collapsed subtrees). Roots ordered by y. */
export function presentationOrder(project: Project): string[] {
  const byParent = new Map<string | null, MindNode[]>();
  for (const n of project.nodes) {
    const arr = byParent.get(n.parentId ?? null) ?? [];
    arr.push(n);
    byParent.set(n.parentId ?? null, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.y - b.y);
  const out: string[] = [];
  function walk(pid: string | null) {
    for (const n of byParent.get(pid) ?? []) {
      out.push(n.id);
      if (!n.collapsed) walk(n.id);
    }
  }
  walk(null);
  return out;
}

function computeAutoLayout(nodes: MindNode[]): MindNode[] {
  // Alias to reflowTree — same algorithm, run from every root.
  return reflowTree(nodes);
}

/** Place a new node relative to its parent (right side, below existing siblings). */
function positionForNewChild(nodes: MindNode[], parentId: string | null) {
  if (!parentId) {
    const roots = nodes.filter((n) => !n.parentId);
    if (roots.length === 0) return { x: 0, y: 0 };
    const maxY = Math.max(...roots.map((n) => n.y));
    return { x: 0, y: maxY + MIN_SLOT_H };
  }
  const parent = nodes.find((n) => n.id === parentId);
  if (!parent) return { x: 0, y: 0 };
  const siblings = nodes.filter((n) => n.parentId === parentId);
  // Proportional offset — wider parents / children get more space.
  const pw = nodeEffectiveWidth(parent);
  const cw = siblings.length ? Math.max(...siblings.map(nodeEffectiveWidth)) : 320;
  const x = parent.x + horizontalOffset(pw, cw);
  if (siblings.length === 0) return { x, y: parent.y };
  const maxY = Math.max(...siblings.map((n) => n.y));
  return { x, y: maxY + MIN_SLOT_H };
}

/**
 * Redistribute descendants of every root so subtrees never overlap vertically.
 * Uses each node's *intrinsic pixel height* (bigger for nodes with images) so
 * only image-adjacent siblings get pushed apart — plain nodes stay tight.
 */
function reflowTree(nodes: MindNode[]): MindNode[] {
  const byParent = new Map<string | null, MindNode[]>();
  for (const n of nodes) {
    const arr = byParent.get(n.parentId ?? null) ?? [];
    arr.push(n);
    byParent.set(n.parentId ?? null, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.y - b.y);

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const subtreeH = new Map<string, number>();
  function measure(id: string): number {
    const self = nodeIntrinsicHeight(nodeById.get(id)!);
    const kids = byParent.get(id) ?? [];
    if (!kids.length) {
      subtreeH.set(id, self);
      return self;
    }
    let total = 0;
    for (let i = 0; i < kids.length; i++) {
      total += measure(kids[i].id);
      if (i > 0) total += SIBLING_GAP;
    }
    const h = Math.max(self, total);
    subtreeH.set(id, h);
    return h;
  }

  const pos = new Map<string, { x: number; y: number }>();
  function place(parentId: string, px: number, py: number) {
    const kids = byParent.get(parentId) ?? [];
    if (!kids.length) return;
    // Horizontal offset scales with the parent's and the widest child's width.
    const parent = nodeById.get(parentId)!;
    const pw = nodeEffectiveWidth(parent);
    const cwMax = Math.max(...kids.map(nodeEffectiveWidth));
    const dx = horizontalOffset(pw, cwMax);
    let total = 0;
    for (let i = 0; i < kids.length; i++) {
      total += subtreeH.get(kids[i].id) ?? MIN_SLOT_H;
      if (i > 0) total += SIBLING_GAP;
    }
    let cursor = py - total / 2;
    for (const k of kids) {
      const kh = subtreeH.get(k.id) ?? MIN_SLOT_H;
      const kx = px + dx;
      const ky = cursor + kh / 2;
      pos.set(k.id, { x: kx, y: ky });
      cursor += kh + SIBLING_GAP;
      place(k.id, kx, ky);
    }
  }

  const roots = byParent.get(null) ?? [];
  roots.forEach((r) => measure(r.id));
  roots.forEach((r) => place(r.id, r.x, r.y));

  return nodes.map((n) => {
    const p = pos.get(n.id);
    return p ? { ...n, x: p.x, y: p.y } : n;
  });
}


function defaultTitleForTemplate(t: ProjectTemplate): string {
  if (t === "tierlist") return "Nova tier list";
  if (t === "iceberg") return "Novo iceberg";
  if (t === "bracket") return "Novo chaveamento";
  if (t === "matrix") return "Nova matriz";
  if (t === "ranking") return "Novo ranking";
  if (t === "scale") return "Nova comparação de escala";
  return "Novo mapa mental";
}

/** Seed nodes for a brand-new project of the given template. */
export function seedNodesForTemplate(template: ProjectTemplate, title: string): MindNode[] {
  const uid2 = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `n_${Math.random().toString(36).slice(2, 9)}`;

  if (template === "tierlist") {
    const boardId = uid2();
    const tiers = ["S", "A", "B", "C", "D"];
    const tierColors = ["rgb(255, 127, 127)", "rgb(255, 191, 127)", "rgb(255, 223, 127)", "rgb(255, 255, 127)", "rgb(191, 255, 127)"];
    return [
      { id: boardId, text: title.trim() || "Tier list", x: 0, y: 0, width: 400, parentId: null, role: "board" },
      ...tiers.map((t, i) => ({
        id: uid2(),
        text: t,
        x: 0,
        y: 0,
        width: 200,
        parentId: boardId,
        role: "tier" as const,
        color: tierColors[i],
        order: i,
      })),
    ];
  }

  if (template === "iceberg") {
    const rootId = uid2();
    const levels = ["Conhecido", "Menos conhecido", "Obscuro", "Secreto", "Proibido"];
    return [
      { id: rootId, text: title.trim() || "Iceberg", x: 0, y: 0, width: 400, parentId: null, role: "iceberg" },
      ...levels.map((label, i) => ({
        id: uid2(),
        text: label,
        x: 0,
        y: 0,
        width: 400,
        parentId: rootId,
        role: "level" as const,
        order: i,
      })),
    ];
  }

  if (template === "bracket") {
    const rootId = uid2();
    return [
      { id: rootId, text: title.trim() || "Chaveamento", x: 0, y: 0, width: 400, parentId: null, role: "bracket", body: "{}" },
    ];
  }

  if (template === "matrix") {
    const rootId = uid2();
    const config = JSON.stringify({
      xLow: "Baixo custo", xHigh: "Alto custo",
      yLow: "Baixo potencial", yHigh: "Alto potencial",
    });
    return [
      { id: rootId, text: title.trim() || "Matriz de posicionamento", x: 0, y: 0, width: 400, parentId: null, role: "matrix", body: config },
    ];
  }

  if (template === "ranking") {
    const rootId = uid2();
    return [
      { id: rootId, text: title.trim() || "Ranking", x: 0, y: 0, width: 400, parentId: null, role: "ranking" },
    ];
  }

  if (template === "scale") {
    const rootId = uid2();
    const config = JSON.stringify({
      unit: "",
      scaleMode: "visual",
      sortMode: "asc",
      accentColor: "#fbbf24",
      barColor: "#38bdf8",
      caption: "Uma comparação em escala.",
    });
    return [
      { id: rootId, text: title.trim() || "Comparação de escala", x: 0, y: 0, width: 400, parentId: null, role: "scale", body: config },
    ];
  }

  // mindmap (default)
  const rootId = uid2();
  return [
    { id: rootId, text: title.trim() || "Ideia central", x: 0, y: 0, width: 560, parentId: null },
  ];
}


export const useStore = create<State & Actions>()((set) => ({
  projects: [],
  avatars: [],
  folders: [],

  hydrate: (projects) => set({ projects }),
  reset: () => set({ projects: [], avatars: [], folders: [] }),

  createProject: (title, folderId, template = "mindmap") => {
    const id = uid("prj");
    const now = new Date().toISOString();
    const nodes = seedNodesForTemplate(template, title);
    const project: Project = {
      id,
      title: title.trim() || defaultTitleForTemplate(template),
      createdAt: now,
      updatedAt: now,
      folderId: folderId ?? null,
      template,
      nodes,
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    set((s) => ({ projects: [project, ...s.projects] }));
    return id;
  },

  importProject: (project) => {
    const now = new Date().toISOString();
    const laidOut = reflowTree(project.nodes);
    const withTimestamps: Project = { ...project, nodes: laidOut, createdAt: now, updatedAt: now };
    set((s) => ({ projects: [withTimestamps, ...s.projects] }));
    return project.id;
  },

  moveProjectToFolder: (projectId, folderId) =>
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? { ...p, folderId, updatedAt: new Date().toISOString() }
          : p,
      ),
    })),

  hydrateFolders: (folders) => set({ folders }),

  createFolder: (name, color) => {
    const id = uid("fld");
    const now = new Date().toISOString();
    set((s) => ({
      folders: [
        ...s.folders,
        {
          id,
          name: name.trim() || "Nova pasta",
          color: color ?? null,
          position: s.folders.length,
          createdAt: now,
          updatedAt: now,
        },
      ],
    }));
    return id;
  },

  renameFolder: (id, name) =>
    set((s) => ({
      folders: s.folders.map((f) =>
        f.id === id ? { ...f, name, updatedAt: new Date().toISOString() } : f,
      ),
    })),

  setFolderColor: (id, color) =>
    set((s) => ({
      folders: s.folders.map((f) =>
        f.id === id ? { ...f, color, updatedAt: new Date().toISOString() } : f,
      ),
    })),

  deleteFolder: (id) =>
    set((s) => ({
      folders: s.folders.filter((f) => f.id !== id),
      // Projects whose folder was deleted fall back to "sem pasta".
      projects: s.projects.map((p) =>
        p.folderId === id
          ? { ...p, folderId: null, updatedAt: new Date().toISOString() }
          : p,
      ),
    })),

  replaceProjectNodes: (projectId, nodes, title) => {
    const laidOut = reflowTree(nodes);
    const now = new Date().toISOString();
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              nodes: laidOut,
              title: title && title.trim() ? title : p.title,
              viewport: { x: 0, y: 0, zoom: 1 },
              updatedAt: now,
            }
          : p,
      ),
    }));
  },

  setProjectNodes: (projectId, nodes) =>
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? { ...p, nodes, updatedAt: new Date().toISOString() }
          : p,
      ),
    })),



  deleteProject: (id) =>
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),

  renameProject: (id, title) =>
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === id ? { ...p, title, updatedAt: new Date().toISOString() } : p,
      ),
    })),

  setIcebergAtmosphere: (id, atmosphere) =>
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === id ? { ...p, icebergAtmosphere: atmosphere, updatedAt: new Date().toISOString() } : p,
      ),
    })),

  addNode: (projectId, patch) => {
    const id = uid("n");
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const parentId = patch?.parentId ?? null;
        const auto = positionForNewChild(p.nodes, parentId);
        const node: MindNode = {
          id,
          text: patch?.text ?? "",
          x: patch?.x ?? auto.x,
          y: patch?.y ?? auto.y,
          // Width is adaptive by default (see nodeEffectiveWidth); only an
          // explicit request pins it.
          width: patch?.width,

          parentId,
          image: patch?.image,
          imageRef: patch?.imageRef,
          imageName: patch?.imageName,
          color: patch?.color,
        };
        return {
          ...p,
          nodes: reflowTree([...p.nodes, node]),
          updatedAt: new Date().toISOString(),
        };

      }),
    }));
    return id;
  },

  moveNodes: (projectId, deltas) =>
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const dm = new Map(deltas.map((d) => [d.id, d]));
        return {
          ...p,
          nodes: p.nodes.map((n) => {
            const d = dm.get(n.id);
            return d ? { ...n, x: n.x + d.dx, y: n.y + d.dy } : n;
          }),
          updatedAt: new Date().toISOString(),
        };
      }),
    })),


  updateNode: (projectId, nodeId, patch) =>
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const prev = p.nodes.find((n) => n.id === nodeId);
        const nextNodes = p.nodes.map((n) =>
          n.id === nodeId ? { ...n, ...patch } : n,
        );
        // Reflow when image presence changes, or when a text/width change
        // actually shifts this node's intrinsic height (avoids reflowing on
        // every keystroke inside a single line).
        const imageChanged = "imageRef" in patch || "image" in patch;
        let textAffects = false;
        if (!imageChanged && ("text" in patch || "width" in patch) && prev) {
          const nextNode = nextNodes.find((n) => n.id === nodeId)!;
          textAffects =
            nodeIntrinsicHeight(prev) !== nodeIntrinsicHeight(nextNode);
        }
        const shouldReflow = imageChanged || textAffects;

        return {
          ...p,
          nodes: shouldReflow ? reflowTree(nextNodes) : nextNodes,
          updatedAt: new Date().toISOString(),
        };
      }),
    })),


  deleteNode: (projectId, nodeId) =>
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const toRemove = new Set([nodeId, ...descendantIds(p.nodes, nodeId)]);
        return {
          ...p,
          nodes: reflowTree(p.nodes.filter((n) => !toRemove.has(n.id))),
          updatedAt: new Date().toISOString(),
        };
      }),
    })),

  setParent: (projectId, nodeId, parentId) =>
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        if (wouldCycle(p.nodes, nodeId, parentId)) return p;
        return {
          ...p,
          nodes: reflowTree(
            p.nodes.map((n) => (n.id === nodeId ? { ...n, parentId } : n)),
          ),
          updatedAt: new Date().toISOString(),
        };
      }),
    })),

  toggleCollapsed: (projectId, nodeId) =>
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              nodes: p.nodes.map((n) =>
                n.id === nodeId ? { ...n, collapsed: !n.collapsed } : n,
              ),
              updatedAt: new Date().toISOString(),
            }
          : p,
      ),
    })),

  setNodeColor: (projectId, nodeId, color, cascade) =>
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const descendants = new Set(descendantIds(p.nodes, nodeId));
        const before = buildColorMap(p.nodes);
        return {
          ...p,
          nodes: p.nodes.map((n) => {
            if (n.id === nodeId) return { ...n, color };
            if (!descendants.has(n.id)) return n;
            if (cascade) return { ...n, color: undefined };
            // Without cascade, every descendant must keep exactly the color it
            // displayed before this edit. Because colors inherit from the
            // closest colored ancestor, descendants that had no explicit color
            // need to be pinned to their previous effective color.
            return { ...n, color: before.get(n.id) };
          }),
          updatedAt: new Date().toISOString(),
        };
      }),
    })),


  autoLayout: (projectId) =>
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? { ...p, nodes: computeAutoLayout(p.nodes), updatedAt: new Date().toISOString() }
          : p,
      ),
    })),

  setViewport: (projectId, v) =>
    set((s) => ({
      projects: s.projects.map((p) => (p.id === projectId ? { ...p, viewport: v } : p)),
    })),

  setSonicAvatar: (projectId, patch) =>
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        if (patch === null) {
          const { sonicAvatar: _, ...rest } = p;
          return { ...rest, updatedAt: new Date().toISOString() };
        }
        const base: SonicAvatarUsage = p.sonicAvatar ?? {
          avatarId: "",
          enabled: true,
          xPct: 12,
          yPct: 82,
        };
        return {
          ...p,
          sonicAvatar: { ...base, ...patch },
          updatedAt: new Date().toISOString(),
        };
      }),
    })),

  setNarration: (projectId, ref) =>
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        if (!ref) {
          const { narrationRef: _n, ...rest } = p;
          return { ...rest, updatedAt: new Date().toISOString() };
        }
        return { ...p, narrationRef: ref, updatedAt: new Date().toISOString() };
      }),
    })),

  hydrateAvatars: (avatars) => set({ avatars }),
  upsertAvatarLocal: (entry) =>
    set((s) => {
      const idx = s.avatars.findIndex((a) => a.id === entry.id);
      if (idx === -1) return { avatars: [...s.avatars, entry] };
      const next = s.avatars.slice();
      next[idx] = entry;
      return { avatars: next };
    }),
  removeAvatarLocal: (id) =>
    set((s) => ({ avatars: s.avatars.filter((a) => a.id !== id) })),
}));



export function useProject(id: string | undefined): Project | undefined {
  return useStore((s) => s.projects.find((p) => p.id === id));
}
