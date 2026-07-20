// Canvas Narrativo — manual mind map types.

export interface ImageRef {
  /** Stable id used to look up the file handle / blob in IndexedDB. */
  id: string;
  /** Original filename — shown in UI and used for the broken-image label. */
  name: string;
  size: number;
  lastModified: number;
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

export interface Project {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  nodes: MindNode[];
  /** Persisted last viewport of the editor. */
  viewport?: { x: number; y: number; zoom: number };
}

