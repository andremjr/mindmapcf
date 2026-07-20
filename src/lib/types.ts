// Canvas Narrativo — manual mind map types.

export interface ImageRef {
  /** Stable id used to look up the file handle / blob in IndexedDB. */
  id: string;
  /** Private Supabase Storage path. This is the durable source after reloads. */
  storagePath?: string;
  /** Original filename — shown in UI and used for the broken-image label. */
  name: string;
  size: number;
  lastModified: number;
  contentType?: string;
  /** Media kind. Missing = image (backwards compatible). */
  kind?: "image" | "video";
}

export interface MindNode {
  id: string;
  text: string;
  /** World-space center of the card. */
  x: number;
  y: number;
  /** Card width in world px. */
  width: number;
  /** Parent node id — null means root. */
  parentId: string | null;
  /** Hide descendants when true. */
  collapsed?: boolean;
  /** Legacy inline image (data URL) — kept for backwards compatibility. */
  image?: string;
  /** Preferred: reference to a locally-stored image (never uploaded). */
  imageRef?: ImageRef;
  imageName?: string;
  /** Accent color hex (optional). */
  color?: string;
}

export interface SonicAvatar {
  enabled: boolean;
  imageRef?: ImageRef;
  imageName?: string;
  /** Circle background color (hex). Shows behind transparent PNGs. */
  bgColor: string;
  /** Sound-wave color (hex). */
  waveColor: string;
  /** Diameter in % of the recording frame's shorter side (5–60). */
  sizePct: number;
  /** Center X/Y in % of the frame (0-100). */
  xPct: number;
  yPct: number;
}

export interface Project {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  nodes: MindNode[];
  /** Persisted last viewport of the editor. */
  viewport?: { x: number; y: number; zoom: number };
  /** Optional draggable "sonic avatar" shown inside the recording frame. */
  sonicAvatar?: SonicAvatar;
}


