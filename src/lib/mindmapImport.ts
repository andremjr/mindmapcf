// Import mind maps from Markdown or JSON.
//
// Markdown: mix of `#` headings and indented bullet lists (`-`, `*`, `+`).
//   - The shallowest heading becomes the root; deeper headings and bullets nest.
//   - Bullet indent is auto-detected (2 or 4 spaces / tabs).
// JSON: either
//   { "title": "Root", "children": [ { "title": "...", "children": [...] } ] }
//   or an array of such nodes (first becomes root, others become siblings).
//   Also accepts our own export shape { nodes: MindNode[] }.

import type { MindNode, Project } from "./types";

export interface ImportedTree {
  title: string;
  nodes: MindNode[];
}

interface TreeNode {
  text: string;
  children: TreeNode[];
}

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `n_${Math.random().toString(36).slice(2, 10)}`;
}

// -------- Markdown --------

interface RawLine {
  text: string;
  depth: number; // 0 = root level
}

function parseMarkdown(md: string): TreeNode {
  const rawLines = md.replace(/\r\n/g, "\n").split("\n");
  const lines: RawLine[] = [];

  // Find minimum heading level so we can normalize.
  let minHeading = Infinity;
  for (const l of rawLines) {
    const h = /^(#{1,6})\s+/.exec(l);
    if (h) minHeading = Math.min(minHeading, h[1].length);
  }
  if (!isFinite(minHeading)) minHeading = 1;

  // Detect bullet indent unit (2 spaces, 4 spaces, or tab).
  let indentUnit = 2;
  for (const l of rawLines) {
    const m = /^(\s+)[-*+]\s+/.exec(l);
    if (m) {
      const w = m[1].replace(/\t/g, "  ").length;
      if (w > 0) {
        indentUnit = w;
        break;
      }
    }
  }

  // Track "bullet base depth" — the heading depth under which the current
  // bullet list sits, so bullets nest correctly under their heading.
  let bulletBase = 0;

  for (const raw of rawLines) {
    if (!raw.trim()) continue;

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(raw);
    if (heading) {
      const level = heading[1].length;
      const depth = level - minHeading;
      lines.push({ text: heading[2].trim(), depth });
      bulletBase = depth + 1;
      continue;
    }

    const bullet = /^(\s*)[-*+]\s+(.+?)\s*$/.exec(raw);
    if (bullet) {
      const spaces = bullet[1].replace(/\t/g, "  ").length;
      const bulletDepth = Math.floor(spaces / indentUnit);
      const text = bullet[2].replace(/^\[[ xX]\]\s*/, ""); // strip task boxes
      lines.push({ text: text.trim(), depth: bulletBase + bulletDepth });
      continue;
    }

    // Numbered lists
    const numbered = /^(\s*)\d+\.\s+(.+?)\s*$/.exec(raw);
    if (numbered) {
      const spaces = numbered[1].replace(/\t/g, "  ").length;
      const bulletDepth = Math.floor(spaces / indentUnit);
      lines.push({ text: numbered[2].trim(), depth: bulletBase + bulletDepth });
      continue;
    }
    // Skip plain paragraphs.
  }

  if (lines.length === 0) {
    return { text: "Mapa importado", children: [] };
  }

  // Normalize so the shallowest becomes 0.
  const min = Math.min(...lines.map((l) => l.depth));
  for (const l of lines) l.depth -= min;

  // Build tree via a depth stack.
  const virtualRoot: TreeNode = { text: "__root__", children: [] };
  const stack: { node: TreeNode; depth: number }[] = [{ node: virtualRoot, depth: -1 }];

  for (const l of lines) {
    const node: TreeNode = { text: stripMd(l.text), children: [] };
    while (stack.length && stack[stack.length - 1].depth >= l.depth) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ node, depth: l.depth });
  }

  // If exactly one top-level, that's the root. Otherwise wrap.
  if (virtualRoot.children.length === 1) return virtualRoot.children[0];
  return { text: "Mapa importado", children: virtualRoot.children };
}

function stripMd(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

// -------- JSON --------

interface JsonNode {
  title?: string;
  text?: string;
  name?: string;
  label?: string;
  children?: JsonNode[];
}

function normalizeJson(raw: unknown): TreeNode {
  // Our own export: { nodes: MindNode[] } — rebuild via parentId chain.
  if (raw && typeof raw === "object" && "nodes" in (raw as any) && Array.isArray((raw as any).nodes)) {
    const nodes = (raw as any).nodes as MindNode[];
    const byId = new Map(nodes.map((n) => [n.id, { text: n.text, children: [] as TreeNode[] }]));
    let root: TreeNode | undefined;
    for (const n of nodes) {
      const t = byId.get(n.id)!;
      if (!n.parentId) {
        root = t;
      } else {
        byId.get(n.parentId)?.children.push(t);
      }
    }
    if (root) return root;
  }

  function fromJsonNode(j: JsonNode): TreeNode {
    const text = (j.title ?? j.text ?? j.name ?? j.label ?? "").toString().trim() || "…";
    const children = Array.isArray(j.children) ? j.children.map(fromJsonNode) : [];
    return { text, children };
  }

  if (Array.isArray(raw)) {
    const kids = (raw as JsonNode[]).map(fromJsonNode);
    if (kids.length === 1) return kids[0];
    return { text: "Mapa importado", children: kids };
  }
  if (raw && typeof raw === "object") return fromJsonNode(raw as JsonNode);
  return { text: "Mapa importado", children: [] };
}

// -------- Tree → MindNode[] --------

function treeToNodes(root: TreeNode): MindNode[] {
  const nodes: MindNode[] = [];
  function walk(t: TreeNode, parentId: string | null, depth: number) {
    const id = uid();
    nodes.push({
      id,
      text: t.text,
      x: 0,
      y: 0,
      // No explicit width: let the auto shrink-wrap logic size the card.
      parentId,
    });
    for (const c of t.children) walk(c, id, depth + 1);
  }
  walk(root, null, 0);
  return nodes;
}

// -------- Public API --------

export function importFromText(
  text: string,
  filename: string,
): ImportedTree {
  const trimmed = text.trim();
  const looksJson =
    filename.toLowerCase().endsWith(".json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");
  let tree: TreeNode;
  if (looksJson) {
    try {
      tree = normalizeJson(JSON.parse(trimmed));
    } catch {
      // Fall back to markdown parsing if JSON is malformed.
      tree = parseMarkdown(text);
    }
  } else {
    tree = parseMarkdown(text);
  }
  const nodes = treeToNodes(tree);
  const title = tree.text && tree.text !== "__root__" ? tree.text : "Mapa importado";
  return { title, nodes };
}

/** Build a fresh Project from imported nodes. Layout is applied by the store on add. */
export function buildImportedProject(imported: ImportedTree): Project {
  const now = new Date().toISOString();
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `prj_${Math.random().toString(36).slice(2, 10)}`,
    title: imported.title || "Mapa importado",
    createdAt: now,
    updatedAt: now,
    nodes: imported.nodes,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
