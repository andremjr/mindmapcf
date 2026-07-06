import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Project,
  ProjectStatus,
  AudioFile,
  Transcript,
  TranscriptBlock,
  TextNode,
  CameraKeyframe,
  VisualPreset,
  SafeArea,
  SfxEvent,
  SoundPreset,
  RenderConfig,
} from "./types";
import { buildEmptyProject, buildMockProject } from "./mockProject";
import { mergeBlocks as mergeFn, splitBlock as splitFn } from "./blockGenerator";
import { autoLayoutFull, nodesBounds } from "./layoutEngine";
import { buildCameraKeyframes } from "./cameraEngine";
import { getPreset } from "./presets";
import { getSoundPreset } from "./sfxPresets";
import { generateSfx } from "./sfxGenerator";

interface Viewport {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
}

interface Playback {
  time: number;
  playing: boolean;
  speed: number;
  autoCamera: boolean;
  selectedNodeId?: string;
  viewport: Viewport;
  sfxMuted: boolean;
  sfxMasterVolume: number;
}

interface State {
  projects: Project[];
  transcribing: boolean;
  transcribeError: string | null;
  playback: Playback;
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

  // Canvas
  regenerateLayout: (projectId: string, seed?: number) => void;
  setNodes: (projectId: string, nodes: TextNode[]) => void;
  updateNode: (projectId: string, nodeId: string, patch: Partial<TextNode>) => void;
  moveNode: (projectId: string, nodeId: string, x: number, y: number) => void;

  // Camera
  rebuildCamera: (projectId: string) => void;
  updateCamera: (projectId: string, keyframeId: string, patch: Partial<CameraKeyframe>) => void;

  // Preset
  setPreset: (projectId: string, presetId: string) => void;
  updatePreset: (projectId: string, patch: Partial<VisualPreset>) => void;
  setSafeArea: (projectId: string, area: SafeArea) => void;

  // Playback (runtime)
  setTime: (t: number) => void;
  setPlaying: (v: boolean) => void;
  setSpeed: (v: number) => void;
  setAutoCamera: (v: boolean) => void;
  setSelectedNode: (id: string | undefined) => void;
  setViewport: (v: Partial<Viewport>) => void;
  resetCamera: () => void;

  // SFX
  regenerateSfx: (projectId: string) => void;
  setSfx: (projectId: string, sfx: SfxEvent[]) => void;
  updateSfxEvent: (projectId: string, eventId: string, patch: Partial<SfxEvent>) => void;
  toggleSfxEvent: (projectId: string, eventId: string) => void;
  removeSfxEvent: (projectId: string, eventId: string) => void;
  setSoundPreset: (projectId: string, presetId: string) => void;
  updateSoundPreset: (projectId: string, patch: Partial<SoundPreset>) => void;
  setSfxMuted: (m: boolean) => void;
  setSfxMasterVolume: (v: number) => void;

  // Render config
  updateRenderConfig: (projectId: string, patch: Partial<RenderConfig>) => void;

  setTranscribing: (v: boolean) => void;
  setTranscribeError: (err: string | null) => void;

  reset: () => void;
}

const INITIAL_PLAYBACK: Playback = {
  time: 0,
  playing: false,
  speed: 1,
  autoCamera: true,
  viewport: { x: 0, y: 0, zoom: 1, rotation: 0 },
  sfxMuted: false,
  sfxMasterVolume: 0.8,
};

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      projects: [buildMockProject()],
      transcribing: false,
      transcribeError: null,
      playback: INITIAL_PLAYBACK,

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

      // Canvas
      regenerateLayout: (projectId, seed) =>
        set((s) => {
          let firstNode: TextNode | undefined;
          const projects: Project[] = s.projects.map((p): Project => {
            if (p.id !== projectId) return p;
            const { nodes, chapters } = autoLayoutFull(p.blocks, {
              seed: seed ?? Math.floor(Math.random() * 999),
            });
            const camera = buildCameraKeyframes(p.blocks, nodes, {
              movementIntensity: p.visualPreset.cameraMovementIntensity,
            });
            firstNode = nodes[0];
            return { ...p, nodes, chapters, camera, status: "canvas_generated", updatedAt: new Date().toISOString() };
          });
          const playback = firstNode
            ? { ...s.playback, viewport: { ...s.playback.viewport, x: firstNode.x, y: firstNode.y, zoom: 1 } }
            : s.playback;
          return { projects, playback };
        }),

      setNodes: (projectId, nodes) => get().updateProject(projectId, { nodes }),

      updateNode: (projectId, nodeId, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  updatedAt: new Date().toISOString(),
                  nodes: p.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
                },
          ),
        })),

      moveNode: (projectId, nodeId, x, y) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : { ...p, nodes: p.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)) },
          ),
        })),

      // Camera
      rebuildCamera: (projectId) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId) return p;
            const camera = buildCameraKeyframes(p.blocks, p.nodes, {
              movementIntensity: p.visualPreset.cameraMovementIntensity,
            });
            return { ...p, camera, updatedAt: new Date().toISOString() };
          }),
        })),

      updateCamera: (projectId, keyframeId, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  camera: p.camera.map((k) => (k.id === keyframeId ? { ...k, ...patch } : k)),
                },
          ),
        })),

      // Preset
      setPreset: (projectId, presetId) => {
        const preset = getPreset(presetId);
        get().updateProject(projectId, { visualPreset: preset });
        get().rebuildCamera(projectId);
      },

      updatePreset: (projectId, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : { ...p, visualPreset: { ...p.visualPreset, ...patch } },
          ),
        })),

      setSafeArea: (projectId, area) => get().updateProject(projectId, { safeArea: area }),

      // Playback
      setTime: (t) => set((s) => ({ playback: { ...s.playback, time: t } })),
      setPlaying: (v) => set((s) => ({ playback: { ...s.playback, playing: v } })),
      setSpeed: (v) => set((s) => ({ playback: { ...s.playback, speed: v } })),
      setAutoCamera: (v) => set((s) => ({ playback: { ...s.playback, autoCamera: v } })),
      setSelectedNode: (id) => set((s) => ({ playback: { ...s.playback, selectedNodeId: id } })),
      setViewport: (v) =>
        set((s) => ({ playback: { ...s.playback, viewport: { ...s.playback.viewport, ...v } } })),
      resetCamera: () =>
        set((s) => ({
          playback: { ...s.playback, viewport: { x: 0, y: 0, zoom: 1, rotation: 0 } },
        })),

      // SFX
      regenerateSfx: (projectId) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId) return p;
            const sfx = generateSfx({
              blocks: p.blocks,
              nodes: p.nodes,
              camera: p.camera,
              preset: p.soundPreset,
              durationSec: p.durationSec,
            });
            return { ...p, sfx, updatedAt: new Date().toISOString() };
          }),
        })),

      setSfx: (projectId, sfx) => get().updateProject(projectId, { sfx }),

      updateSfxEvent: (projectId, eventId, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : { ...p, sfx: p.sfx.map((e) => (e.id === eventId ? { ...e, ...patch } : e)) },
          ),
        })),

      toggleSfxEvent: (projectId, eventId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  sfx: p.sfx.map((e) =>
                    e.id === eventId ? { ...e, enabled: e.enabled === false ? true : false } : e,
                  ),
                },
          ),
        })),

      removeSfxEvent: (projectId, eventId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : { ...p, sfx: p.sfx.filter((e) => e.id !== eventId) },
          ),
        })),

      setSoundPreset: (projectId, presetId) => {
        const preset = getSoundPreset(presetId);
        get().updateProject(projectId, { soundPreset: preset });
        get().regenerateSfx(projectId);
      },

      updateSoundPreset: (projectId, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : { ...p, soundPreset: { ...p.soundPreset, ...patch } },
          ),
        })),

      setSfxMuted: (m) => set((s) => ({ playback: { ...s.playback, sfxMuted: m } })),
      setSfxMasterVolume: (v) =>
        set((s) => ({ playback: { ...s.playback, sfxMasterVolume: v } })),

      updateRenderConfig: (projectId, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id !== projectId ? p : { ...p, render: { ...p.render, ...patch } },
          ),
        })),

      setTranscribing: (v) => set({ transcribing: v }),
      setTranscribeError: (err) => set({ transcribeError: err }),

      reset: () =>
        set({
          projects: [buildMockProject()],
          transcribing: false,
          transcribeError: null,
          playback: INITIAL_PLAYBACK,
        }),
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

export function fitViewport(
  nodes: Pick<TextNode, "x" | "y">[],
  width = 1200,
  height = 700,
  padding = 200,
): Viewport {
  const b = nodesBounds(nodes as TextNode[]);
  const w = b.maxX - b.minX + padding * 2;
  const h = b.maxY - b.minY + padding * 2;
  const zoom = Math.min(width / w, height / h, 1);
  return {
    x: (b.minX + b.maxX) / 2,
    y: (b.minY + b.maxY) / 2,
    zoom,
    rotation: 0,
  };
}
