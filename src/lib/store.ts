import { create } from "zustand";
import type { MindNode, Project } from "./types";

function uid(_prefix = "id") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${_prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

interface State {
  projects: Project[];
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
}

const H_GAP = 340;
const SIBLING_GAP = 40;
/** Baseline card height (no image, single-line text). */
const BASE_NODE_H = 88;
/** Extra vertical space added when a node shows an image. */
const IMAGE_NODE_H = 190;
/** Extra per additional line of text (rough). */
const LINE_H = 22;
/** Minimum vertical "slot" for a leaf without image (keeps a nice rhythm). */
const MIN_SLOT_H = 120;

function nodeIntrinsicHeight(n: MindNode): number {
  const lines = Math.max(1, (n.text || "").split(/\r?\n/).length);
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

  hydrate: (projects) => set({ projects }),
  reset: () => set({ projects: [] }),

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
          width: 300,
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
          width: patch?.width ?? (parentId ? 260 : 300),
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
        const nextNodes = p.nodes.map((n) =>
          n.id === nodeId ? { ...n, ...patch } : n,
        );
        // If the change affects intrinsic height, reflow to keep spacing right.
        // Only reflow when image presence changes — text edits shouldn't
        // shove the layout around on every keystroke.
        const heightAffecting = "imageRef" in patch || "image" in patch;

        return {
          ...p,
          nodes: heightAffecting ? reflowTree(nextNodes) : nextNodes,
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
}));


export function useProject(id: string | undefined): Project | undefined {
  return useStore((s) => s.projects.find((p) => p.id === id));
}
