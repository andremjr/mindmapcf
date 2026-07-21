import { create } from "zustand";
import type { MindNode, Project, SonicAvatarEntry, SonicAvatarUsage } from "./types";


function uid(_prefix = "id") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${_prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

interface State {
  projects: Project[];
  avatars: SonicAvatarEntry[];
}

interface Actions {
  hydrate: (projects: Project[]) => void;
  reset: () => void;
  createProject: (title: string) => string;
  importProject: (project: Project) => string;
  replaceProjectNodes: (projectId: string, nodes: MindNode[], title?: string) => void;
  deleteProject: (id: string) => void;
  renameProject: (id: string, title: string) => void;



  addNode: (
    projectId: string,
    node?: Partial<MindNode> & { parentId?: string | null },
  ) => string;
  updateNode: (projectId: string, nodeId: string, patch: Partial<MindNode>) => void;
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

  // Global user-scoped avatar library
  hydrateAvatars: (avatars: SonicAvatarEntry[]) => void;
  upsertAvatarLocal: (entry: SonicAvatarEntry) => void;
  removeAvatarLocal: (id: string) => void;
}


const H_GAP = 500;
const SIBLING_GAP = 40;
/** Baseline card height (no image, single-line text). */
const BASE_NODE_H = 88;
/** Extra vertical space added when a node shows an image. */
const IMAGE_NODE_H = 190;
/** Extra per additional line of text (rough). */
const LINE_H = 22;
/** Minimum vertical "slot" for a leaf without image (keeps a nice rhythm). */
const MIN_SLOT_H = 120;

/** Default card width used by NodeCard when node.width is not set. */
const DEFAULT_NODE_W = 420;
/** Approximate character width for wrap estimation (text-base ~16px). */
const CHAR_W = 8.2;
/** Horizontal padding inside the card (px-4 on both sides). */
const CARD_PAD_X = 32;

function nodeIntrinsicHeight(n: MindNode): number {
  const w = (n.width ?? DEFAULT_NODE_W) - CARD_PAD_X;
  const charsPerLine = Math.max(10, Math.floor(w / CHAR_W));
  const raw = n.text || "";
  const segments = raw.split(/\r?\n/);
  let lines = 0;
  for (const seg of segments) {
    // Wrap by words to mimic CSS whitespace-pre-wrap behavior.
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
      // Very long single word: wrap-break.
      while (col > charsPerLine) {
        segLines += 1;
        col -= charsPerLine;
      }
    }
    lines += segLines;
  }
  lines = Math.max(1, lines);
  const hasImage = !!(n.imageRef || n.image);
  const h = BASE_NODE_H + (hasImage ? IMAGE_NODE_H : 0) + Math.max(0, lines - 1) * LINE_H;
  return Math.max(MIN_SLOT_H, h);
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
  const x = parent.x + H_GAP;
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
    let total = 0;
    for (let i = 0; i < kids.length; i++) {
      total += subtreeH.get(kids[i].id) ?? MIN_SLOT_H;
      if (i > 0) total += SIBLING_GAP;
    }
    let cursor = py - total / 2;
    for (const k of kids) {
      const kh = subtreeH.get(k.id) ?? MIN_SLOT_H;
      const kx = px + H_GAP;
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


export const useStore = create<State & Actions>()((set) => ({
  projects: [],
  avatars: [],

  hydrate: (projects) => set({ projects }),
  reset: () => set({ projects: [], avatars: [] }),

  createProject: (title) => {
    const id = uid("prj");
    const now = new Date().toISOString();
    const rootId = uid("n");
    const project: Project = {
      id,
      title: title.trim() || "Novo mapa mental",
      createdAt: now,
      updatedAt: now,
      nodes: [
        {
          id: rootId,
          text: title.trim() || "Ideia central",
          x: 0,
          y: 0,
          width: 460,
          parentId: null,
        },
      ],
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

  deleteProject: (id) =>
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),

  renameProject: (id, title) =>
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === id ? { ...p, title, updatedAt: new Date().toISOString() } : p,
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
          width: patch?.width ?? (parentId ? 420 : 460),
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
        const descendants = cascade
          ? new Set(descendantIds(p.nodes, nodeId))
          : null;
        return {
          ...p,
          nodes: p.nodes.map((n) => {
            if (n.id === nodeId) return { ...n, color };
            if (descendants && descendants.has(n.id))
              return { ...n, color: undefined };
            return n;
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
