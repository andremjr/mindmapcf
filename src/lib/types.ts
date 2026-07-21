// Canvas Narrativo — manual mind map types.

export interface ImageRef {
  /** Stable id used to look up the file handle / blob in IndexedDB. */
  id: string;
  /** Local reference shown in the UI. Browsers expose the filename, not a full OS path. */
  localPath?: string;
  /** Private Supabase Storage path. Only sonic avatar images should set this. */
  storagePath?: string;
  /** Storage bucket. Only sonic avatar images should set this to `avatar-images`. */
  bucket?: string;
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

/**
 * A user-owned "sonic avatar" from the global library (persisted in
 * Supabase table `sonic_avatars`). One avatar can be reused across many
 * mind maps — it represents the creator's channel identity.
 */
export interface SonicAvatarEntry {
  id: string;
  name: string;
  /** Reference to an avatar image stored in the private `avatar-images` bucket. */
  imageRef?: ImageRef;
  imageName?: string;
  /** Circle background color (hex). */
  bgColor: string;
  /** Sound-wave color (hex). */
  waveColor: string;
  /** Diameter in % of the recording frame's shorter side (5–60). */
  sizePct: number;
}

/**
 * Per-project usage of a global avatar. Position is per-project because
 * the user may drag the avatar during a specific recording.
 */
export interface SonicAvatarUsage {
  /** References a row in the `sonic_avatars` library. */
  avatarId: string;
  enabled: boolean;
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
  /** Reference + placement for the sonic avatar shown during recording. */
  sonicAvatar?: SonicAvatarUsage;
  /** Optional folder to group projects. null/undefined = "sem pasta". */
  folderId?: string | null;
}

export interface Folder {
  id: string;
  name: string;
  color?: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}



