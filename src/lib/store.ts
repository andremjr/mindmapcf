import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { MindNode, Project } from "./types";

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

interface State {
  projects: Project[];
}

interface Actions {
  createProject: (title: string) => string;
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
  autoLayout: (projectId: string) => void;

  setViewport: (projectId: string, v: { x: number; y: number; zoom: number }) => void;
}

const H_GAP = 340;
const V_GAP = 130;

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
  const byParent = new Map<string | null, MindNode[]>();
  for (const n of nodes) {
    const arr = byParent.get(n.parentId ?? null) ?? [];
    arr.push(n);
    byParent.set(n.parentId ?? null, arr);
  }
  const leafHeight = new Map<string, number>();
  function measure(id: string): number {
    const kids = byParent.get(id) ?? [];
    if (kids.length === 0) {
      leafHeight.set(id, 1);
      return 1;
    }
    const h = kids.reduce((s, k) => s + measure(k.id), 0);
    leafHeight.set(id, h);
    return h;
  }
  const roots = byParent.get(null) ?? [];
  roots.forEach((r) => measure(r.id));

  const pos = new Map<string, { x: number; y: number }>();
  function place(node: MindNode, depth: number, yStart: number) {
    const h = leafHeight.get(node.id) ?? 1;
    const yCenter = yStart + (h * V_GAP) / 2 - V_GAP / 2;
    pos.set(node.id, { x: depth * H_GAP, y: yCenter });
    let cy = yStart;
    for (const kid of byParent.get(node.id) ?? []) {
      const kh = leafHeight.get(kid.id) ?? 1;
      place(kid, depth + 1, cy);
      cy += kh * V_GAP;
    }
  }
  let offset = 0;
  for (const r of roots) {
    place(r, 0, offset);
    offset += (leafHeight.get(r.id) ?? 1) * V_GAP + V_GAP;
  }
  return nodes.map((n) => {
    const p = pos.get(n.id);
    return p ? { ...n, x: p.x, y: p.y } : n;
  });
}

/** Place a new node relative to its parent (right side, below existing siblings). */
function positionForNewChild(nodes: MindNode[], parentId: string | null) {
  if (!parentId) {
    // New root — place below existing roots.
    const roots = nodes.filter((n) => !n.parentId);
    if (roots.length === 0) return { x: 0, y: 0 };
    const maxY = Math.max(...roots.map((n) => n.y));
    return { x: 0, y: maxY + V_GAP };
  }
  const parent = nodes.find((n) => n.id === parentId);
  if (!parent) return { x: 0, y: 0 };
  const siblings = nodes.filter((n) => n.parentId === parentId);
  const x = parent.x + H_GAP;
  if (siblings.length === 0) return { x, y: parent.y };
  const maxY = Math.max(...siblings.map((n) => n.y));
  return { x, y: maxY + V_GAP };
}

/**
 * Redistribute descendants of every root so subtrees never overlap vertically.
 * Roots keep their (x,y); each child block is centered on its parent and
 * given `subtreeLeafCount * V_GAP` of vertical space. Runs after every
 * structural change (add / delete / reparent) so new nodes automatically
 * push siblings apart.
 */
function reflowTree(nodes: MindNode[]): MindNode[] {
  const byParent = new Map<string | null, MindNode[]>();
  for (const n of nodes) {
    const arr = byParent.get(n.parentId ?? null) ?? [];
    arr.push(n);
    byParent.set(n.parentId ?? null, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.y - b.y);

  const leaves = new Map<string, number>();
  function measure(id: string): number {
    const kids = byParent.get(id) ?? [];
    if (!kids.length) {
      leaves.set(id, 1);
      return 1;
    }
    const h = kids.reduce((s, k) => s + measure(k.id), 0);
    leaves.set(id, h);
    return h;
  }

  const pos = new Map<string, { x: number; y: number }>();
  function place(parentId: string, px: number, py: number) {
    const kids = byParent.get(parentId) ?? [];
    if (!kids.length) return;
    const total = kids.reduce((s, k) => s + (leaves.get(k.id) ?? 1), 0);
    let cursor = py - (total * V_GAP) / 2;
    for (const k of kids) {
      const lh = leaves.get(k.id) ?? 1;
      const kx = px + H_GAP;
      const ky = cursor + (lh * V_GAP) / 2;
      pos.set(k.id, { x: kx, y: ky });
      cursor += lh * V_GAP;
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

export const useStore = create<State & Actions>()(
  persist(
    (set) => ({
      projects: [],

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
          projects: s.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  nodes: p.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        })),

      deleteNode: (projectId, nodeId) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId) return p;
            const toRemove = new Set([nodeId, ...descendantIds(p.nodes, nodeId)]);
            return {
              ...p,
              nodes: p.nodes.filter((n) => !toRemove.has(n.id)),
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
              nodes: p.nodes.map((n) => (n.id === nodeId ? { ...n, parentId } : n)),
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
    }),
    {
      name: "canvas-narrativo:v3",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : (undefined as any),
      ),
      partialize: (s) => ({ projects: s.projects }),
    },
  ),
);

export function useProject(id: string | undefined): Project | undefined {
  return useStore((s) => s.projects.find((p) => p.id === id));
}
