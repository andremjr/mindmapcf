// Canvas Narrativo — manual mind map types.

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
  /** Optional image (data URL). */
  image?: string;
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
