import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Project,
  ProjectStatus,
  AudioFile,
  Transcript,
  TranscriptBlock,
} from "./types";
import { buildEmptyProject, buildMockProject } from "./mockProject";
import { mergeBlocks as mergeFn, splitBlock as splitFn } from "./blockGenerator";

interface State {
  projects: Project[];
  /** Sessão de transcrição (não persistida). */
  transcribing: boolean;
  transcribeError: string | null;
}

interface Actions {
  createProject: (title: string) => string;
  deleteProject: (id: string) => void;
  updateProject: (id: string, patch: Partial<Project>) => void;
  setStatus: (id: string, status: ProjectStatus) => void;

  setAudio: (id: string, audio: AudioFile | undefined) => void;
  setTranscript: (id: string, transcript: Transcript) => void;
  setBlocks: (id: string, blocks: TranscriptBlock[]) => void;

  updateBlock: (projectId: string, blockId: string, patch: Partial<TranscriptBlock>) => void;
  removeBlock: (projectId: string, blockId: string) => void;
  mergeWithNext: (projectId: string, blockId: string) => void;
  splitBlockAt: (projectId: string, blockId: string, atChar: number) => void;

  setTranscribing: (v: boolean) => void;
  setTranscribeError: (err: string | null) => void;

  reset: () => void;
}

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      projects: [buildMockProject()],
      transcribing: false,
      transcribeError: null,

      createProject: (title) => {
        const p = buildEmptyProject(title || "Projeto sem título");
        set((s) => ({ projects: [p, ...s.projects] }));
        return p.id;
      },
      deleteProject: (id) =>
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),

      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
          ),
        })),

      setStatus: (id, status) => get().updateProject(id, { status }),

      setAudio: (id, audio) => {
        const status: ProjectStatus = audio ? "audio_uploaded" : "draft";
        get().updateProject(id, {
          audio,
          status,
          durationSec: audio?.durationSec ?? 0,
        });
      },

      setTranscript: (id, transcript) =>
        get().updateProject(id, { transcript, status: "transcribed" }),

      setBlocks: (id, blocks) =>
        get().updateProject(id, { blocks, status: "blocks_generated" }),

      updateBlock: (projectId, blockId, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  updatedAt: new Date().toISOString(),
                  blocks: p.blocks.map((b) =>
                    b.id === blockId ? { ...b, ...patch } : b,
                  ),
                },
          ),
        })),

      removeBlock: (projectId, blockId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : { ...p, blocks: p.blocks.filter((b) => b.id !== blockId) },
          ),
        })),

      mergeWithNext: (projectId, blockId) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId) return p;
            const idx = p.blocks.findIndex((b) => b.id === blockId);
            if (idx < 0 || idx >= p.blocks.length - 1) return p;
            const merged = mergeFn(p.blocks[idx], p.blocks[idx + 1]);
            const next = [...p.blocks];
            next.splice(idx, 2, merged);
            return { ...p, blocks: next };
          }),
        })),

      splitBlockAt: (projectId, blockId, atChar) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId) return p;
            const idx = p.blocks.findIndex((b) => b.id === blockId);
            if (idx < 0) return p;
            const [a, b] = splitFn(p.blocks[idx], atChar);
            const next = [...p.blocks];
            next.splice(idx, 1, a, b);
            return { ...p, blocks: next };
          }),
        })),

      setTranscribing: (v) => set({ transcribing: v }),
      setTranscribeError: (err) => set({ transcribeError: err }),

      reset: () => set({ projects: [buildMockProject()], transcribing: false, transcribeError: null }),
    }),
    {
      name: "canvas-narrativo-store",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return window.localStorage;
      }),
      partialize: (s) => ({ projects: s.projects }),
    },
  ),
);

export function useProject(id: string | undefined) {
  return useStore((s) => s.projects.find((p) => p.id === id));
}
