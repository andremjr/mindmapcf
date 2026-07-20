// Canvas Narrativo — manual mind map types.

export interface MindNode {
  id: string;
  text: string;
  /** World-space center of the card. */
  x: number;
  y: number;
  /** Card width in world px (auto-set by editor when empty). */
  width: number;
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
  /** Presentation order — array of node ids. Nodes not listed appear at the end. */
  order: string[];
  /** Persisted last viewport of the editor. */
  viewport?: { x: number; y: number; zoom: number };
}
