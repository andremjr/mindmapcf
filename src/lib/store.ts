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

  addNode: (projectId: string, node?: Partial<MindNode>) => string;
  updateNode: (projectId: string, nodeId: string, patch: Partial<MindNode>) => void;
  deleteNode: (projectId: string, nodeId: string) => void;
  reorderNodes: (projectId: string, order: string[]) => void;

  setViewport: (projectId: string, v: { x: number; y: number; zoom: number }) => void;
}

export const useStore = create<State & Actions>()(
  persist(
    (set) => ({
      projects: [],

      createProject: (title) => {
        const id = uid("prj");
        const now = new Date().toISOString();
        const project: Project = {
          id,
          title: title.trim() || "Novo mapa mental",
          createdAt: now,
          updatedAt: now,
          nodes: [],
          order: [],
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
            // spawn near center of last node (or origin)
            const last = p.nodes[p.nodes.length - 1];
            const baseX = patch?.x ?? (last ? last.x + 380 : 0);
            const baseY = patch?.y ?? (last ? last.y : 0);
            const node: MindNode = {
              id,
              text: patch?.text ?? "Novo nó",
              x: baseX,
              y: baseY,
              width: patch?.width ?? 360,
              image: patch?.image,
              imageName: patch?.imageName,
              color: patch?.color,
            };
            return {
              ...p,
              nodes: [...p.nodes, node],
              order: [...p.order, id],
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
          projects: s.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  nodes: p.nodes.filter((n) => n.id !== nodeId),
                  order: p.order.filter((id) => id !== nodeId),
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        })),

      reorderNodes: (projectId, order) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, order, updatedAt: new Date().toISOString() } : p,
          ),
        })),

      setViewport: (projectId, v) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, viewport: v } : p,
          ),
        })),
    }),
    {
      name: "canvas-narrativo:v2",
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

/** Compute presentation order — persisted order + any nodes not in it (creation order). */
export function presentationOrder(project: Project): string[] {
  const set = new Set(project.order);
  const missing = project.nodes.map((n) => n.id).filter((id) => !set.has(id));
  return [...project.order.filter((id) => project.nodes.some((n) => n.id === id)), ...missing];
}
