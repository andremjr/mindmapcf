import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft,
  Plus,
  Play,
  Maximize,
  LayoutGrid,
  Trash2,
  Circle,
  Upload,
  Mic,
  Sun,
  Moon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MindNode, Project } from "@/lib/types";
import { useStore, descendantIds, nodeEffectiveWidth } from "@/lib/store";
import { MindMapCanvas } from "./MindMapCanvas";
import { NodeCard } from "./NodeCard";
import { LinkFrame } from "./Presentation";
import { ImportDialog } from "./ImportDialog";
import { SonicAvatarDialog } from "./SonicAvatarDialog";
import { importFromText } from "@/lib/mindmapImport";
import { buildColorMap, NODE_COLOR_PALETTE } from "@/lib/nodeColors";
import { toast } from "sonner";

import { pickMediaAndStore } from "@/lib/imageStorage";
import { startRecording } from "@/lib/screenRecorder";
import { RECORD_FORMATS, saveRecordFormat, type RecordFormat } from "@/lib/recordFormats";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { resolveEmbed } from "@/lib/embedUrl";


const FREE_NODE_LIMIT = 30;




export function MindMapEditor({ project }: { project: Project }) {
  const addNode = useStore((s) => s.addNode);
  const updateNode = useStore((s) => s.updateNode);
  const moveNodes = useStore((s) => s.moveNodes);
  const deleteNode = useStore((s) => s.deleteNode);
  const setParent = useStore((s) => s.setParent);
  const toggleCollapsed = useStore((s) => s.toggleCollapsed);
  const runAutoLayout = useStore((s) => s.autoLayout);
  const renameProject = useStore((s) => s.renameProject);
  const replaceProjectNodes = useStore((s) => s.replaceProjectNodes);
  const setNodeColor = useStore((s) => s.setNodeColor);
  const setViewportPersist = useStore((s) => s.setViewport);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPro } = useSubscription(user?.id);

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [viewport, setViewport] = useState(project.viewport ?? { x: 0, y: 0, zoom: 1 });
  const [selectedId, setSelectedId] = useState<string | undefined>(project.nodes[0]?.id);
  // Extra IDs selected in addition to the primary `selectedId`.
  const [extraSelectedIds, setExtraSelectedIds] = useState<string[]>([]);
  const selectedIds = useMemo(() => {
    const s = new Set<string>();
    if (selectedId) s.add(selectedId);
    for (const id of extraSelectedIds) s.add(id);
    return Array.from(s);
  }, [selectedId, extraSelectedIds]);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [pendingEdge, setPendingEdge] = useState<
    | { fromId: string; toX: number; toY: number; overNodeId?: string }
    | null
  >(null);
  const [dropTargetId, setDropTargetId] = useState<string | undefined>();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [marquee, setMarquee] = useState<
    | { x0: number; y0: number; x1: number; y1: number }
    | null
  >(null);

  const handleNodeSelect = useCallback(
    (id: string, additive: boolean) => {
      if (!additive) {
        setSelectedId(id);
        setExtraSelectedIds([]);
        return;
      }
      setSelectedId((cur) => cur ?? id);
      setExtraSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    },
    [],
  );

  function canAddMoreNodes() {
    return isPro || project.nodes.length < FREE_NODE_LIMIT;
  }

  function showNodeLimit() {
    setUpgradeOpen(true);
    toast.error("O plano grátis permite até 30 nós por mapa.");
  }

  function addNodeGuarded(
    patch?: Partial<MindNode> & { parentId?: string | null },
  ): string | null {
    if (!canAddMoreNodes()) {
      showNodeLimit();
      return null;
    }
    return addNode(project.id, patch);
  }

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      const r = containerRef.current!.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setViewportPersist(project.id, viewport), 400);
    return () => clearTimeout(t);
  }, [viewport, project.id, setViewportPersist]);

  // --- Coordinate helpers ---
  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const rect = containerRef.current!.getBoundingClientRect();
      const mx = sx - rect.left - rect.width / 2;
      const my = sy - rect.top - rect.height / 2;
      return { x: viewport.x + mx / viewport.zoom, y: viewport.y + my / viewport.zoom };
    },
    [viewport],
  );

  // --- Visible node set (respect collapsed) ---
  const visibleIds = useMemo(() => {
    const hidden = new Set<string>();
    for (const n of project.nodes) {
      if (n.collapsed) {
        for (const d of descendantIds(project.nodes, n.id)) hidden.add(d);
      }
    }
    return new Set(project.nodes.map((n) => n.id).filter((id) => !hidden.has(id)));
  }, [project.nodes]);

  const childCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of project.nodes) {
      if (n.parentId) m.set(n.parentId, (m.get(n.parentId) ?? 0) + 1);
    }
    return m;
  }, [project.nodes]);

  const colorMap = useMemo(() => buildColorMap(project.nodes), [project.nodes]);


  // --- Pan background / Marquee select ---
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const marqueeRef = useRef<
    | { startX: number; startY: number; additive: boolean }
    | null
  >(null);
  function onBgPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    if (e.button !== 0 && e.button !== 1) return;
    // Shift+drag on the background starts a marquee selection.
    if (e.shiftKey && e.button === 0) {
      const w = screenToWorld(e.clientX, e.clientY);
      marqueeRef.current = { startX: w.x, startY: w.y, additive: e.ctrlKey || e.metaKey };
      setMarquee({ x0: w.x, y0: w.y, x1: w.x, y1: w.y });
      return;
    }
    setSelectedId(undefined);
    setExtraSelectedIds([]);
    panRef.current = { sx: e.clientX, sy: e.clientY, vx: viewport.x, vy: viewport.y };
  }
  useEffect(() => {
    function onMove(e: PointerEvent) {
      // Safety: if no mouse button is being pressed, cancel any drag/marquee.
      if (e.buttons === 0) {
        if (panRef.current) panRef.current = null;
        if (marqueeRef.current) {
          marqueeRef.current = null;
          setMarquee(null);
        }
        return;
      }
      if (marqueeRef.current) {
        const w = screenToWorld(e.clientX, e.clientY);
        setMarquee({
          x0: marqueeRef.current.startX,
          y0: marqueeRef.current.startY,
          x1: w.x,
          y1: w.y,
        });
        return;
      }
      if (!panRef.current) return;
      const dx = (e.clientX - panRef.current.sx) / viewport.zoom;
      const dy = (e.clientY - panRef.current.sy) / viewport.zoom;
      setViewport((v) => ({ ...v, x: panRef.current!.vx - dx, y: panRef.current!.vy - dy }));
    }
    function finish() {
      if (marqueeRef.current) {
        const m = marquee;
        const additive = marqueeRef.current.additive;
        marqueeRef.current = null;
        if (m) {
          const minX = Math.min(m.x0, m.x1);
          const maxX = Math.max(m.x0, m.x1);
          const minY = Math.min(m.y0, m.y1);
          const maxY = Math.max(m.y0, m.y1);
          const hit: string[] = [];
          for (const n of project.nodes) {
            if (!visibleIds.has(n.id)) continue;
            const w = nodeEffectiveWidth(n);
            if (
              n.x + w / 2 >= minX &&
              n.x - w / 2 <= maxX &&
              n.y + 60 >= minY &&
              n.y - 60 <= maxY
            ) {
              hit.push(n.id);
            }
          }
          if (hit.length > 0) {
            if (additive) {
              setExtraSelectedIds((prev) => Array.from(new Set([...prev, ...hit])));
            } else {
              setSelectedId(hit[0]);
              setExtraSelectedIds(hit.slice(1));
            }
          } else if (!additive) {
            setSelectedId(undefined);
            setExtraSelectedIds([]);
          }
        }
        setMarquee(null);
      }
      panRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
    };
  }, [viewport.zoom, marquee, project.nodes, visibleIds, screenToWorld]);

  // --- Zoom ---
  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaX) < 2 && e.deltaMode === 0) {
      // Normal wheel: still zoom (mind-map convention)
    }
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    const newZoom = Math.max(0.2, Math.min(2.5, viewport.zoom * (1 + delta)));
    const rect = containerRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left - rect.width / 2;
    const my = e.clientY - rect.top - rect.height / 2;
    const worldX = viewport.x + mx / viewport.zoom;
    const worldY = viewport.y + my / viewport.zoom;
    const nx = worldX - mx / newZoom;
    const ny = worldY - my / newZoom;
    setViewport({ x: nx, y: ny, zoom: newZoom });
  }

  // --- Node dragging (single or group) ---
  const dragRef = useRef<
    | {
        id: string;
        sx: number;
        sy: number;
        nx: number;
        ny: number;
        moved: boolean;
        group?: { id: string; sx: number; sy: number }[];
      }
    | null
  >(null);
  // --- Resize (right-edge handle) ---
  const resizeRef = useRef<
    | { id: string; startX: number; startWidth: number }
    | null
  >(null);

  function findNodeAt(clientX: number, clientY: number, ignoreId?: string): string | undefined {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const nodeEl = el?.closest("[data-node-id]") as HTMLElement | null;
    const id = nodeEl?.dataset.nodeId;
    if (!id || id === ignoreId) return undefined;
    return id;
  }

  function onNodeDragStart(node: MindNode, e: React.PointerEvent) {
    if (editingId === node.id) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    // Group drag when node is part of a multi-selection.
    const inMulti = selectedIds.length > 1 && selectedIds.includes(node.id);
    const group = inMulti
      ? project.nodes
          .filter((n) => selectedIds.includes(n.id))
          .map((n) => ({ id: n.id, sx: n.x, sy: n.y }))
      : undefined;
    dragRef.current = {
      id: node.id,
      sx: e.clientX,
      sy: e.clientY,
      nx: node.x,
      ny: node.y,
      moved: false,
      group,
    };
  }
  function onNodeResizeStart(node: MindNode, e: React.PointerEvent) {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    resizeRef.current = {
      id: node.id,
      startX: e.clientX,
      startWidth: nodeEffectiveWidth(node),
    };
  }
  useEffect(() => {
    function onMove(e: PointerEvent) {
      // Resize takes priority.
      const r = resizeRef.current;
      if (r) {
        const dx = (e.clientX - r.startX) / viewport.zoom;
        const next = Math.max(220, Math.min(900, Math.round(r.startWidth + dx)));
        updateNode(project.id, r.id, { width: next });
        return;
      }
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.sx) / viewport.zoom;
      const dy = (e.clientY - d.sy) / viewport.zoom;
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      d.moved = true;
      if (d.group && d.group.length > 1) {
        moveNodes(
          project.id,
          d.group.map((g) => ({ id: g.id, dx: g.sx + dx - (project.nodes.find((n) => n.id === g.id)?.x ?? g.sx), dy: g.sy + dy - (project.nodes.find((n) => n.id === g.id)?.y ?? g.sy) })),
        );
      } else {
        updateNode(project.id, d.id, { x: d.nx + dx, y: d.ny + dy });
      }
      // Alt held → highlight target for re-parenting (single-node drag only)
      if (e.altKey && !(d.group && d.group.length > 1)) {
        const desc = new Set([d.id, ...descendantIds(project.nodes, d.id)]);
        const overId = findNodeAt(e.clientX, e.clientY, d.id);
        setDropTargetId(overId && !desc.has(overId) ? overId : undefined);
      } else {
        setDropTargetId(undefined);
      }
    }
    function onUp(e: PointerEvent) {
      if (resizeRef.current) {
        resizeRef.current = null;
        return;
      }
      const d = dragRef.current;
      dragRef.current = null;
      if (d && d.moved && e.altKey && !(d.group && d.group.length > 1)) {
        const desc = new Set([d.id, ...descendantIds(project.nodes, d.id)]);
        const overId = findNodeAt(e.clientX, e.clientY, d.id);
        if (overId && !desc.has(overId)) {
          setParent(project.id, d.id, overId);
        }
      }
      setDropTargetId(undefined);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [viewport.zoom, project.id, project.nodes, updateNode, moveNodes, setParent, selectedIds]);

  // --- Connect gesture (drag from handle) ---
  useEffect(() => {
    if (!pendingEdge) return;
    function onMove(e: PointerEvent) {
      const w = screenToWorld(e.clientX, e.clientY);
      const overId = findNodeAt(e.clientX, e.clientY, pendingEdge!.fromId);
      setPendingEdge((p) => (p ? { ...p, toX: w.x, toY: w.y, overNodeId: overId } : p));
    }
    function onUp(e: PointerEvent) {
      const from = pendingEdge!.fromId;
      const overId = findNodeAt(e.clientX, e.clientY, from);
      if (overId) {
        // Reparent overId under `from` (unless it would cycle)
        setParent(project.id, overId, from);
      } else {
        // Create new child at drop position
        const w = screenToWorld(e.clientX, e.clientY);
        const id = addNodeGuarded({ parentId: from, x: w.x, y: w.y });
        if (!id) return;
        setSelectedId(id);
        setEditingId(id);
      }
      setPendingEdge(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [pendingEdge, project.id, screenToWorld, setParent, addNode, isPro, project.nodes.length]);

  function startConnect(node: MindNode, e: React.PointerEvent) {
    setSelectedId(node.id);
    const w = screenToWorld(e.clientX, e.clientY);
    setPendingEdge({ fromId: node.id, toX: w.x, toY: w.y });
  }

  // --- Paste image from clipboard: download to Downloads + prompt selection ---
  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;

      const items = e.clipboardData?.items;
      if (!items) return;
      let file: File | null = null;
      for (const it of Array.from(items)) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          file = it.getAsFile();
          break;
        }
      }
      if (!file) return;
      e.preventDefault();

      if (!selectedId) {
        toast.error("Selecione um nó antes de colar a imagem.");
        return;
      }

      const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const filename = `print-${stamp}.${ext}`;
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);

      const nodeId = selectedId;
      toast.success(`Print salvo como ${filename}`, {
        description: "Clique em “Selecionar arquivo” e escolha esse arquivo na pasta Downloads para vincular ao nó.",
        duration: 15000,
        action: {
          label: "Selecionar arquivo",
          onClick: async () => {
            try {
              const ref = await pickMediaAndStore("image");
              if (!ref) return;
              updateNode(project.id, nodeId, {
                imageRef: ref,
                imageName: ref.name,
                image: undefined,
              });
            } catch (error) {
              console.error("[mindmap] paste pick", error);
              toast.error("Não foi possível vincular a imagem.");
            }
          },
        },
      });
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [selectedId, project.id, updateNode]);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;

      if (!selectedId) return;

      if (e.key === "Tab") {
        e.preventDefault();
        const id = addNodeGuarded({ parentId: selectedId });
        if (!id) return;
        setSelectedId(id);
        setEditingId(id);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const sel = project.nodes.find((n) => n.id === selectedId);
        if (!sel) return;
        if (!sel.parentId) {
          // Root: Enter adds a child instead of a sibling.
          const id = addNodeGuarded({ parentId: sel.id });
          if (!id) return;
          setSelectedId(id);
          setEditingId(id);
        } else {
          const id = addNodeGuarded({ parentId: sel.parentId });
          if (!id) return;
          setSelectedId(id);
          setEditingId(id);
        }
      } else if (e.key === "F2") {
        e.preventDefault();
        setEditingId(selectedId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const sel = project.nodes.find((n) => n.id === selectedId);
        if (!sel) return;
        deleteNode(project.id, selectedId);
        setSelectedId(sel.parentId ?? project.nodes[0]?.id);
      } else if (e.key === " ") {
        e.preventDefault();
        toggleCollapsed(project.id, selectedId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, project.id, project.nodes, addNode, deleteNode, toggleCollapsed, isPro]);

  // Link overlay (opened by clicking a node's link chip in the editor).
  const [openLinkUrl, setOpenLinkUrl] = useState<string | null>(null);
  const [linkBlocked, setLinkBlocked] = useState(false);
  const linkLoadedRef = useRef(false);


  function handleAdd() {
    // Add a child of selected, or a new root if none selected.
    const parentId = selectedId ?? null;
    const id = addNodeGuarded({ parentId });
    if (!id) return;
    setSelectedId(id);
    setEditingId(id);
  }

  function handlePresent() {
    setViewportPersist(project.id, viewport);
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    navigate({ to: "/projects/$id/present", params: { id: project.id } });
  }

  const [recordFormatOpen, setRecordFormatOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  function handleRecordAndPresent() {
    setViewportPersist(project.id, viewport);
    setRecordFormatOpen(true);
  }


  async function handleImportFile(file: File) {
    try {
      const text = await file.text();
      const imported = importFromText(text, file.name);
      if (imported.nodes.length === 0) {
        toast.error("Arquivo vazio ou não reconhecido.");
        return;
      }
      if (!isPro && imported.nodes.length > FREE_NODE_LIMIT) {
        setImportOpen(false);
        setUpgradeOpen(true);
        toast.error("O plano grátis permite importar mapas com até 30 nós.");
        return;
      }
      const base = file.name.replace(/\.[^.]+$/, "");
      const newTitle =
        imported.title && imported.title !== "Mapa importado" ? imported.title : base;
      replaceProjectNodes(project.id, imported.nodes, newTitle);
      setSelectedId(imported.nodes[0]?.id);
      setEditingId(undefined);
      setViewport({ x: 0, y: 0, zoom: 1 });
      setImportOpen(false);
      toast.success(`Mapa importado — ${imported.nodes.length} nós (o mapa anterior foi substituído).`);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao importar. Verifique o arquivo .md ou .json.");
    }
  }

  async function startRecordingWithFormat(fmt: RecordFormat) {
    setRecordFormatOpen(false);
    saveRecordFormat(project.id, fmt);
    try {
      await startRecording({ filenameBase: project.title || "apresentacao", armed: true });
    } catch (e: any) {
      console.error("[mindmap] recording start", e);
      if (e?.name !== "NotAllowedError") {
        alert(e?.message || "Não foi possível iniciar a gravação.");
      }
      return;
    }
    navigate({
      to: "/projects/$id/present",
      params: { id: project.id },
      search: { record: "1" },
    });
  }


  function fitAll() {
    const visibleNodes = project.nodes.filter((n) => visibleIds.has(n.id));
    if (visibleNodes.length === 0) {
      setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const n of visibleNodes) {
      const w = n.width ?? 260;
      minX = Math.min(minX, n.x - w / 2);
      maxX = Math.max(maxX, n.x + w / 2);
      minY = Math.min(minY, n.y - 100);
      maxY = Math.max(maxY, n.y + 100);
    }
    const bw = maxX - minX + 240;
    const bh = maxY - minY + 240;
    const zoom = Math.min(size.w / bw, size.h / bh, 1.2);
    setViewport({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom });
  }

  function handleBgDoubleClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    const w = screenToWorld(e.clientX, e.clientY);
    const id = addNodeGuarded({ parentId: null, x: w.x, y: w.y });
    if (!id) return;
    setSelectedId(id);
    setEditingId(id);
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="h-14 border-b border-border/60 flex items-center px-4 gap-4 bg-background/60 backdrop-blur">
        <Link to="/projects" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          <span>Mapas</span>
        </Link>
        <div className="h-6 w-px bg-border" />
        <input
          value={project.title}
          onChange={(e) => renameProject(project.id, e.target.value)}
          className="bg-transparent outline-none font-semibold text-sm min-w-0 flex-1 max-w-md"
        />
        <div className="ml-auto flex items-center gap-2">
          {!isPro && (
            <button
              onClick={() => setUpgradeOpen(true)}
              className="rounded-full border border-border/60 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              title="Limite do plano grátis"
            >
              {project.nodes.length}/{FREE_NODE_LIMIT} nós
            </button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => runAutoLayout(project.id)}
            className="gap-2"
            title="Organizar horizontalmente"
          >
            <LayoutGrid className="size-4" /> Organizar
          </Button>
          <Button variant="ghost" size="sm" onClick={fitAll} className="gap-2">
            <Maximize className="size-4" /> Ver tudo
          </Button>
          <Button variant="secondary" size="sm" onClick={handleAdd} className="gap-2" disabled={!canAddMoreNodes()}>
            <Plus className="size-4" /> Nó
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="gap-2"
            title="Importar mapa de IA (substitui o mapa atual)"
          >
            <Upload className="size-4" /> Importar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (!isPro) {
                setUpgradeOpen(true);
                return;
              }
              setAvatarOpen(true);
            }}
            className="gap-2"
            title={isPro ? "Escolher avatar sonoro para gravação" : "Recurso Pro"}
          >
            <Mic className="size-4" />
            {project.sonicAvatar?.avatarId && project.sonicAvatar?.enabled ? "Avatar ✓" : "Avatar"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRecordAndPresent}
            className="gap-2"
            disabled={project.nodes.length === 0}
            title="Grava tela + microfone durante a apresentação"
          >
            <Circle className="size-3 fill-destructive text-destructive" /> Gravar
          </Button>
          <Button size="sm" onClick={handlePresent} className="gap-2" disabled={project.nodes.length === 0}>
            <Play className="size-4" /> Apresentar
          </Button>

        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <main className="relative flex-1 min-w-0">
          <div ref={containerRef} className="absolute inset-0">
            <MindMapCanvas
              nodes={project.nodes}
              visibleIds={visibleIds}
              viewport={viewport}
              containerSize={size}
              pendingEdge={pendingEdge}
              colorById={colorMap}
              onBackgroundPointerDown={onBgPointerDown}
              onWheel={onWheel}
              onBackgroundDoubleClick={handleBgDoubleClick}
            >
              {project.nodes.map((n) => {
                if (!visibleIds.has(n.id)) return null;
                const isDropTarget = dropTargetId === n.id;
                const isMultiSel = selectedIds.length > 1 && selectedIds.includes(n.id);
                return (
                  <div
                    key={n.id}
                    style={{
                      outline: isDropTarget
                        ? "2px solid color-mix(in oklch, var(--primary) 80%, transparent)"
                        : isMultiSel
                          ? "2px dashed color-mix(in oklch, var(--primary) 70%, transparent)"
                          : undefined,
                      outlineOffset: 4,
                      borderRadius: 12,
                    }}
                  >
                    <NodeCard
                      node={n}
                      childCount={childCounts.get(n.id) ?? 0}
                      selected={selectedId === n.id || isMultiSel}
                      editing={editingId === n.id}
                      effectiveColor={colorMap.get(n.id)}
                      hasDescendants={(childCounts.get(n.id) ?? 0) > 0}
                      onSelect={(e) => handleNodeSelect(n.id, !!(e && (e.shiftKey || e.metaKey || e.ctrlKey)))}
                      onStartEdit={() => {
                        setSelectedId(n.id);
                        setExtraSelectedIds([]);
                        setEditingId(n.id);
                      }}
                      onEndEdit={() => setEditingId(undefined)}
                      onChange={(patch) => updateNode(project.id, n.id, patch)}
                      onDelete={() => {
                        deleteNode(project.id, n.id);
                        setSelectedId(n.parentId ?? undefined);
                        setExtraSelectedIds([]);
                        setEditingId(undefined);
                      }}
                      onDragStart={(e) => onNodeDragStart(n, e)}
                      onResizeStart={(e) => onNodeResizeStart(n, e)}
                      onStartConnect={(e) => startConnect(n, e)}
                      onAddChild={() => {
                        const id = addNodeGuarded({ parentId: n.id });
                        if (!id) return;
                        setSelectedId(id);
                        setEditingId(id);
                      }}
                      onToggleCollapsed={() => toggleCollapsed(project.id, n.id)}
                      onPickImage={async () => {
                        try {
                          const ref = await pickMediaAndStore("image");
                          if (!ref) return;
                          updateNode(project.id, n.id, {
                            imageRef: ref,
                            imageName: ref.name,
                            image: undefined,
                          });
                        } catch (error) {
                          console.error("[mindmap] image pick", error);
                          alert("Não foi possível adicionar essa imagem.");
                        }
                      }}
                      onPickVideo={async () => {
                        try {
                          const ref = await pickMediaAndStore("video");
                          if (!ref) return;
                          updateNode(project.id, n.id, {
                            imageRef: ref,
                            imageName: ref.name,
                            image: undefined,
                          });
                        } catch (error) {
                          console.error("[mindmap] video pick", error);
                          alert("Não foi possível adicionar esse vídeo.");
                        }
                      }}
                      onSetColor={(color, cascade) =>
                        setNodeColor(project.id, n.id, color, cascade)
                      }
                      onOpenLink={(url) => {
                        linkLoadedRef.current = false;
                        setLinkBlocked(false);
                        setOpenLinkUrl(url);
                      }}
                    />
                  </div>
                );
              })}
            </MindMapCanvas>
          </div>

          {marquee && (() => {
            const minX = Math.min(marquee.x0, marquee.x1);
            const maxX = Math.max(marquee.x0, marquee.x1);
            const minY = Math.min(marquee.y0, marquee.y1);
            const maxY = Math.max(marquee.y0, marquee.y1);
            const sx = (minX - viewport.x) * viewport.zoom + size.w / 2;
            const sy = (minY - viewport.y) * viewport.zoom + size.h / 2;
            return (
              <div
                className="pointer-events-none absolute border border-primary/60 bg-primary/10 rounded"
                style={{
                  left: sx,
                  top: sy,
                  width: (maxX - minX) * viewport.zoom,
                  height: (maxY - minY) * viewport.zoom,
                }}
              />
            );
          })()}


          {project.nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="pointer-events-auto text-center rounded-xl border border-dashed border-border/60 bg-card/50 px-8 py-10">
                <p className="text-muted-foreground mb-4">Comece adicionando um nó ao seu mapa.</p>
                <Button onClick={handleAdd} className="gap-2">
                  <Plus className="size-4" /> Adicionar nó
                </Button>
              </div>
            </div>
          )}

          {/* Bottom bar: zoom + hints */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-full border border-border/60 bg-popover/90 backdrop-blur px-2 py-1 text-xs font-mono">
            <button
              className="px-2 py-1 hover:bg-muted rounded-full"
              onClick={() => setViewport((v) => ({ ...v, zoom: Math.max(0.2, v.zoom / 1.2) }))}
            >
              −
            </button>
            <span className="tabular-nums">{Math.round(viewport.zoom * 100)}%</span>
            <button
              className="px-2 py-1 hover:bg-muted rounded-full"
              onClick={() => setViewport((v) => ({ ...v, zoom: Math.min(2.5, v.zoom * 1.2) }))}
            >
              +
            </button>
          </div>

          <div className="absolute bottom-4 right-4 rounded-lg border border-border/60 bg-popover/85 backdrop-blur px-3 py-2 text-[11px] leading-relaxed text-muted-foreground max-w-[240px]">
            <div className="text-foreground/80 font-semibold mb-1">Atalhos</div>
            <div><kbd className="font-mono">Tab</kbd> filho · <kbd className="font-mono">Enter</kbd> irmão</div>
            <div><kbd className="font-mono">F2</kbd> editar · <kbd className="font-mono">Del</kbd> excluir · <kbd className="font-mono">Espaço</kbd> recolher</div>
            <div>Alça azul: puxar p/ criar/reconectar</div>
            <div><kbd className="font-mono">Shift</kbd>+arrastar fundo: seleção múltipla · arrastar grupo move junto</div>
            <div><kbd className="font-mono">Alt</kbd>+arrastar: mudar pai · Duplo-clique: novo nó</div>
          </div>
        </main>

        {selectedId && (
          <aside className="w-72 shrink-0 border-l border-border/60 bg-card/40 flex flex-col">
            <div className="px-4 py-3 border-b border-border/60">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Nó selecionado</div>
            </div>
            <SelectedPanel
              node={project.nodes.find((n) => n.id === selectedId)}
              effectiveColor={selectedId ? colorMap.get(selectedId) : undefined}
              hasChildren={selectedId ? (childCounts.get(selectedId) ?? 0) > 0 : false}
              onChangeText={(text) =>
                selectedId && updateNode(project.id, selectedId, { text })
              }
              onChangeUrl={(url) =>
                selectedId && updateNode(project.id, selectedId, { url: url.trim() || undefined })
              }
              onPickImage={async () => {
                if (!selectedId) return;
                try {
                  const ref = await pickMediaAndStore("image");
                  if (!ref) return;
                  updateNode(project.id, selectedId, {
                    imageRef: ref,
                    imageName: ref.name,
                    image: undefined,
                  });
                } catch (error) {
                  console.error("[mindmap] image pick", error);
                  toast.error("Não foi possível adicionar essa imagem.");
                }
              }}
              onPickVideo={async () => {
                if (!selectedId) return;
                try {
                  const ref = await pickMediaAndStore("video");
                  if (!ref) return;
                  updateNode(project.id, selectedId, {
                    imageRef: ref,
                    imageName: ref.name,
                    image: undefined,
                  });
                } catch (error) {
                  console.error("[mindmap] video pick", error);
                  toast.error("Não foi possível adicionar esse vídeo.");
                }
              }}
              onClearMedia={() =>
                selectedId &&
                updateNode(project.id, selectedId, {
                  imageRef: undefined,
                  imageName: undefined,
                  image: undefined,
                })
              }
              onSetColor={(color, cascade) =>
                selectedId && setNodeColor(project.id, selectedId, color, cascade)
              }
              onToggleCollapsed={() =>
                selectedId && toggleCollapsed(project.id, selectedId)
              }
              onDetach={() => selectedId && setParent(project.id, selectedId, null)}
              onDelete={() => {
                if (!selectedId) return;
                const sel = project.nodes.find((n) => n.id === selectedId);
                deleteNode(project.id, selectedId);
                setSelectedId(sel?.parentId ?? undefined);
              }}
              onResetWidth={() =>
                selectedId && updateNode(project.id, selectedId, { width: undefined })
              }
            />

          </aside>
        )}
      </div>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onFile={handleImportFile}
        title="Importar mapa de IA"
        warning="Importar vai SUBSTITUIR todos os nós do mapa atual. Essa ação não pode ser desfeita."
      />

      {user?.id && (
        <SonicAvatarDialog
          userId={user.id}
          isPro={isPro}
          open={avatarOpen}
          onClose={() => setAvatarOpen(false)}
          selectionProjectId={project.id}
          onUpgrade={() => setUpgradeOpen(true)}
        />
      )}



      {recordFormatOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur grid place-items-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border/60 bg-card shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border/60">
              <h2 className="text-lg font-semibold">Formato de gravação</h2>
              <p className="text-xs text-muted-foreground mt-1">
                A gravação usa <b>Region Capture</b> — só o quadro selecionado entra no vídeo.
                Controles, timer e navegação ficam fora do quadro e não aparecem no arquivo final.
              </p>
              <button
                onClick={() => {
                  setRecordFormatOpen(false);
                  setAvatarOpen(true);
                }}
                className="mt-3 inline-flex items-center gap-2 text-xs rounded-md border border-border/60 hover:border-primary hover:bg-muted/50 px-3 py-1.5"
              >
                <Mic className="size-3.5" />
                {project.sonicAvatar?.avatarId && project.sonicAvatar?.enabled
                  ? "Editar avatar sonoro"
                  : "Escolher avatar sonoro (Pro)"}

              </button>
            </div>

            <div className="p-3 grid gap-2">
              {RECORD_FORMATS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => startRecordingWithFormat(f)}
                  className="text-left p-3 rounded-lg border border-border/60 hover:border-primary hover:bg-muted/50 transition flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-medium text-sm">{f.label}</div>
                    {f.hint && <div className="text-xs text-muted-foreground">{f.hint}</div>}
                  </div>
                  <div
                    className="rounded border border-border/60 bg-background shrink-0"
                    style={{
                      width: 48,
                      height: 48 * (f.height / f.width),
                      maxHeight: 64,
                    }}
                  />
                </button>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-border/60 flex justify-end">
              <button
                onClick={() => setRecordFormatOpen(false)}
                className="px-3 py-2 text-sm rounded-md hover:bg-muted"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} user={user} />
      {openLinkUrl && (
        <div className="fixed inset-0 z-50">
          <LinkFrame
            url={openLinkUrl}
            onClose={() => setOpenLinkUrl(null)}
            blocked={linkBlocked}
            onLoaded={() => {
              linkLoadedRef.current = true;
              setLinkBlocked(false);
            }}
            onBlocked={() => {
              if (!linkLoadedRef.current) setLinkBlocked(true);
            }}
            resetLoaded={() => {
              linkLoadedRef.current = false;
              setLinkBlocked(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function SelectedPanel({
  node,
  effectiveColor,
  hasChildren,
  onChangeText,
  onChangeUrl,
  onPickImage,
  onPickVideo,
  onClearMedia,
  onSetColor,
  onToggleCollapsed,
  onDetach,
  onDelete,
  onResetWidth,
}: {
  node: MindNode | undefined;
  effectiveColor: string | undefined;
  hasChildren: boolean;
  onChangeText: (text: string) => void;
  onChangeUrl: (url: string) => void;
  onPickImage: () => void;
  onPickVideo: () => void;
  onClearMedia: () => void;
  onSetColor: (color: string | undefined, cascade: boolean) => void;
  onToggleCollapsed: () => void;
  onDetach: () => void;
  onDelete: () => void;
  onResetWidth: () => void;
}) {
  const [cascade, setCascade] = useState(false);
  if (!node) return null;
  const hasMedia = !!(node.imageRef || node.image);
  const mediaKind = node.imageRef?.kind ?? (node.image ? "image" : undefined);
  const ownColor = node.color;
  const displayColor = ownColor ?? effectiveColor;

  return (
    <div className="flex-1 overflow-auto p-4 space-y-5 text-sm">
      {/* Text */}
      <section className="space-y-1.5">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Texto</div>
        <textarea
          value={node.text}
          onChange={(e) => onChangeText(e.target.value)}
          rows={4}
          placeholder="Digite o texto do nó…"
          className="w-full resize-y rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </section>

      {/* Media */}
      <section className="space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Mídia</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onPickImage}
            className="rounded-md border border-border/60 hover:border-primary hover:bg-muted/50 px-3 py-2 text-xs"
          >
            {mediaKind === "image" ? "Trocar imagem" : "Adicionar imagem"}
          </button>
          <button
            onClick={onPickVideo}
            className="rounded-md border border-border/60 hover:border-primary hover:bg-muted/50 px-3 py-2 text-xs"
          >
            {mediaKind === "video" ? "Trocar vídeo" : "Adicionar vídeo"}
          </button>
        </div>
        {hasMedia && (
          <div className="flex items-center justify-between rounded-md bg-muted/40 border border-border/50 px-3 py-2 text-xs">
            <span className="truncate text-muted-foreground" title={node.imageName || ""}>
              {mediaKind === "video" ? "Vídeo" : "Imagem"}
              {node.imageName ? `: ${node.imageName}` : ""}
            </span>
            <button
              onClick={onClearMedia}
              className="text-destructive hover:underline shrink-0 ml-2"
            >
              Remover
            </button>
          </div>
        )}
      </section>

      {/* Link */}
      <section className="space-y-1.5">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Link (opcional)</div>
        <input
          type="url"
          value={node.url ?? ""}
          onChange={(e) => onChangeUrl(e.target.value)}
          placeholder="https://exemplo.com"
          className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <LinkStatus url={node.url} />
      </section>

      {/* Color */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Cor</div>
          {displayColor && (
            <span
              className="inline-block size-3 rounded-full border border-border/60"
              style={{ background: displayColor }}
              aria-hidden
            />
          )}
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {NODE_COLOR_PALETTE.map((c) => {
            const active = ownColor === c.value;
            return (
              <button
                key={c.value}
                onClick={() => onSetColor(c.value, cascade)}
                title={c.name}
                className={`size-7 rounded-full border transition ${
                  active
                    ? "border-foreground ring-2 ring-foreground/30"
                    : "border-border/60 hover:scale-110"
                }`}
                style={{ background: c.value }}
              />
            );
          })}
        </div>
        {hasChildren && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={cascade}
              onChange={(e) => setCascade(e.target.checked)}
              className="accent-primary"
            />
            Aplicar a toda a ramificação
          </label>
        )}
        {ownColor && (
          <button
            onClick={() => onSetColor(undefined, false)}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Limpar cor (herdar do pai)
          </button>
        )}
      </section>

      {/* Info + actions */}
      <section className="space-y-2 pt-2 border-t border-border/60">
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <div>Pai</div>
            <div className="text-foreground">{node.parentId ? "sim" : "raiz"}</div>
          </div>
          <div>
            <div>Recolhido</div>
            <div className="text-foreground">{node.collapsed ? "sim" : "não"}</div>
          </div>
        </div>
        <div className="rounded-md border border-border/50 px-3 py-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Largura</span>
            <span className="tabular-nums text-foreground">
              {node.width ? `${Math.round(node.width)} px` : "auto"}
            </span>
          </div>
          {node.width && (
            <button
              onClick={onResetWidth}
              className="mt-1 text-[11px] text-primary hover:underline underline-offset-2"
            >
              Voltar para largura automática
            </button>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground/80 leading-snug">
            Arraste a alça azul na borda direita do nó para ajustar manualmente.
          </p>
        </div>

        {hasChildren && (
          <button
            onClick={onToggleCollapsed}
            className="w-full text-left rounded-md px-3 py-2 text-xs hover:bg-muted border border-border/50"
          >
            {node.collapsed ? "Expandir filhos" : "Recolher filhos"}
          </button>
        )}
        {node.parentId && (
          <button
            onClick={onDetach}
            className="w-full text-left rounded-md px-3 py-2 text-xs hover:bg-muted border border-border/50"
          >
            Desconectar do pai (virar raiz)
          </button>
        )}
        <button
          onClick={onDelete}
          className="w-full text-left rounded-md px-3 py-2 text-xs text-destructive hover:bg-destructive/10 border border-destructive/30 flex items-center gap-2"
        >
          <Trash2 className="size-3.5" /> Excluir nó (e filhos)
        </button>
      </section>
    </div>
  );
}

/**
 * Feedback contextual sobre o link do nó: mostra quais plataformas tocam
 * embutidas na apresentação, alerta quando o Instagram é detectado
 * (que só mostra a capa) e permite testar o embed direto no inspetor
 * antes de gravar.
 */
function LinkStatus({ url }: { url?: string }) {
  const [testing, setTesting] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const info = useMemo(() => {
    if (!url || !url.trim()) return null;
    try {
      const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      const u = new URL(withProto);
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      const embed = resolveEmbed(url);
      let kind: "youtube" | "x" | "tiktok" | "vimeo" | "instagram" | "generic" = "generic";
      if (embed?.platform === "youtube") kind = "youtube";
      else if (embed?.platform === "twitter") kind = "x";
      else if (embed?.platform === "tiktok") kind = "tiktok";
      else if (embed?.platform === "vimeo") kind = "vimeo";
      else if (embed?.platform === "instagram" || host.endsWith("instagram.com")) kind = "instagram";
      return { kind, host, src: embed?.embedUrl ?? withProto };
    } catch {
      return null;
    }
  }, [url]);

  // Reset test state when URL changes.
  useEffect(() => {
    setTesting(false);
    setBlocked(false);
    setLoaded(false);
  }, [url]);

  // Blocked fallback timer when testing a generic site.
  useEffect(() => {
    if (!testing || loaded) return;
    const t = window.setTimeout(() => setBlocked(true), 3500);
    return () => window.clearTimeout(t);
  }, [testing, loaded]);

  if (!info) {
    return (
      <p className="text-[10px] text-muted-foreground/80 leading-snug">
        <strong>Apresentar:</strong> o link sempre abre em nova aba (ideal para gravar por fora com OBS).
        <br />
        <strong>Gravar:</strong> abre embutido dentro do quadro. YouTube, X, TikTok e Vimeo tocam embutidos. Instagram mostra só a capa. Blogs/notícias dependem do site permitir embed.
      </p>
    );
  }

  const palette: Record<typeof info.kind, { label: string; tone: "ok" | "warn" | "info"; note: string }> = {
    youtube: { label: "YouTube", tone: "ok", note: "No modo Gravar toca embutido no quadro (sem cookies). No modo Apresentar abre em nova aba." },
    x: { label: "X (Twitter)", tone: "ok", note: "No modo Gravar toca embutido. No modo Apresentar abre em nova aba." },
    tiktok: { label: "TikTok", tone: "ok", note: "No modo Gravar toca embutido. No modo Apresentar abre em nova aba." },
    vimeo: { label: "Vimeo", tone: "ok", note: "No modo Gravar toca embutido. No modo Apresentar abre em nova aba." },
    instagram: {
      label: "Instagram",
      tone: "warn",
      note: "No modo Gravar mostra só a capa (o Instagram não permite tocar o vídeo embutido). Use o modo Apresentar + OBS, ou baixe o Reel e suba como vídeo no nó.",
    },
    generic: {
      label: info.host,
      tone: "info",
      note: "No modo Apresentar abre em nova aba (sempre funciona). No modo Gravar tenta embutir — use \"Testar\" abaixo para confirmar antes de gravar. Se o site bloquear, use o modo Apresentar com OBS.",
    },
  };
  const p = palette[info.kind];
  const toneClass =
    p.tone === "ok"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : p.tone === "warn"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
      : "border-border/60 bg-muted/30 text-muted-foreground";

  return (
    <div className="space-y-2">
      <div className={`rounded-md border px-2.5 py-2 text-[11px] leading-snug ${toneClass}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{p.label}</span>
          <span className="text-[10px] opacity-80">
            {p.tone === "ok" ? "toca embutido" : p.tone === "warn" ? "só capa" : "depende do site"}
          </span>
        </div>
        <p className="mt-1 opacity-90">{p.note}</p>
      </div>

      {info.kind === "generic" && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => {
              setBlocked(false);
              setLoaded(false);
              setTesting((v) => !v);
            }}
            className="text-[11px] rounded-md border border-border/60 px-2.5 py-1 hover:bg-muted/40"
          >
            {testing ? "Fechar teste" : "Testar embed aqui"}
          </button>
          {testing && (
            <div className="rounded-md border border-border/60 overflow-hidden bg-black relative" style={{ height: 180 }}>
              {!blocked ? (
                <iframe
                  src={info.src}
                  title="Teste de embed"
                  className="w-full h-full"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  referrerPolicy="no-referrer-when-downgrade"
                  onLoad={() => setLoaded(true)}
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-center p-3 text-[11px] text-muted-foreground">
                  Este site bloqueia embed. Na apresentação ele abrirá em nova aba.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
