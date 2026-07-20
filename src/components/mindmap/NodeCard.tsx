import { useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Trash2,
  X,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Film,
  Palette,
  Check,
} from "lucide-react";
import type { MindNode } from "@/lib/types";
import { resolveImage, requestImageAccess } from "@/lib/imageStorage";
import { NODE_COLOR_PALETTE, DEFAULT_ACCENT } from "@/lib/nodeColors";



interface Props {
  node: MindNode;
  childCount: number;
  selected: boolean;
  editing: boolean;
  presentation?: boolean;
  active?: boolean;
  /** Resolved accent color (inherits from ancestors — computed by parent). */
  effectiveColor?: string;
  /** Whether this node has any descendants (used to enable branch-cascade). */
  hasDescendants?: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onChange: (patch: Partial<MindNode>) => void;
  onDelete: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  onStartConnect?: (e: React.PointerEvent) => void;
  onAddChild?: () => void;
  onToggleCollapsed?: () => void;
  onPickImage?: () => void;
  onPickVideo?: () => void;
  onSetColor?: (color: string | undefined, cascade: boolean) => void;
}


export function NodeCard({
  node,
  childCount,
  selected,
  editing,
  presentation,
  active,
  effectiveColor,
  hasDescendants,
  onSelect,
  onStartEdit,
  onEndEdit,
  onChange,
  onDelete,
  onDragStart,
  onStartConnect,
  onAddChild,
  onToggleCollapsed,
  onPickImage,
  onPickVideo,
  onSetColor,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [cascade, setCascade] = useState(true);


  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editing]);

  const w = node.width ?? 260;
  const accent = effectiveColor ?? node.color ?? DEFAULT_ACCENT;
  const isRoot = !node.parentId;
  const isThemed = accent !== DEFAULT_ACCENT;

  // When themed, tint the whole border with the accent. When on the default
  // accent, keep the muted chrome so the map doesn't look like every card is
  // "selected".
  const borderStyle: React.CSSProperties = isThemed
    ? {
        borderColor: presentation && !active ? undefined : accent,
        boxShadow:
          presentation && active
            ? `0 0 0 2px ${accent}66, 0 30px 80px -20px rgba(0,0,0,0.85)`
            : selected
              ? `0 0 0 1px ${accent}, 0 10px 30px -14px rgba(0,0,0,0.5)`
              : undefined,
        borderLeftColor: isRoot ? accent : undefined,
        borderLeftWidth: isRoot ? 4 : 1,
      }
    : {
        borderLeftColor: isRoot ? accent : undefined,
        borderLeftWidth: isRoot ? 4 : 1,
      };

  const chromeClass = presentation
    ? active
      ? isThemed
        ? "shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]"
        : "border-primary/80 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] ring-2 ring-primary/40"
      : "border-border/20 opacity-25 blur-[1.5px]"
    : selected
      ? isThemed
        ? "shadow-[0_10px_30px_-14px_rgba(0,0,0,0.5)]"
        : "border-primary shadow-[0_10px_30px_-14px_rgba(0,0,0,0.5)]"
      : "border-border/60 hover:border-border";

  return (
    <div
      data-node
      data-node-id={node.id}
      className={`absolute rounded-xl border bg-card/95 backdrop-blur transition-shadow ${chromeClass}`}
      style={{
        left: node.x - w / 2,
        top: node.y,
        width: w,
        transform: "translateY(-50%)",
        ...borderStyle,
      }}
      onPointerDown={(e) => {
        if (presentation) return;
        if ((e.target as HTMLElement).closest("[data-nodrag]")) return;
        onSelect();
        onDragStart(e);
      }}
      onDoubleClick={(e) => {
        if (presentation) return;
        e.stopPropagation();
        onStartEdit();
      }}
    >

      <NodeMedia
        node={node}
        presentation={presentation}
        active={active}
        onClear={() =>
          onChange({ image: undefined, imageRef: undefined, imageName: undefined })
        }
      />

      <div className="px-4 py-3">

        {editing && !presentation ? (
          <textarea
            ref={textareaRef}
            data-nodrag
            value={node.text}
            onChange={(e) => onChange({ text: e.target.value })}
            onBlur={onEndEdit}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onEndEdit();
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onEndEdit();
              }
              e.stopPropagation();
            }}
            rows={Math.max(1, node.text.split("\n").length)}
            placeholder="Digite…"
            className={`w-full bg-transparent outline-none resize-none leading-snug ${
              isRoot ? "text-lg font-semibold" : "text-base"
            }`}
          />
        ) : (
          <p
            className={`whitespace-pre-wrap leading-snug ${
              presentation
                ? "text-2xl md:text-3xl"
                : isRoot
                  ? "text-lg font-semibold"
                  : "text-base"
            } ${node.text ? "text-foreground" : "text-muted-foreground/70 italic"}`}
          >
            {node.text || (isRoot ? "Ideia central" : "Novo nó")}
          </p>
        )}
      </div>

      {/* Collapse toggle */}
      {!presentation && childCount > 0 && (
        <button
          data-nodrag
          onClick={onToggleCollapsed}
          className="absolute top-1/2 -translate-y-1/2 -right-3 size-6 grid place-items-center rounded-full bg-background border border-border/70 hover:bg-muted text-muted-foreground z-10"
          title={node.collapsed ? "Expandir" : "Recolher"}
          aria-label="Alternar filhos"
        >
          {node.collapsed ? (
            <ChevronRight className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>
      )}

      {/* Connection handle (drag to make/repoint child) */}
      {!presentation && (selected || active) && (
        <div
          data-nodrag
          data-connect-handle
          onPointerDown={(e) => {
            e.stopPropagation();
            onStartConnect?.(e);
          }}
          className="absolute top-1/2 -translate-y-1/2 -right-6 size-5 rounded-full bg-primary/90 border-2 border-background cursor-crosshair hover:scale-110 transition-transform"
          title="Arraste para conectar a outro nó ou solte no vazio para criar filho"
          aria-label="Conectar"
        />
      )}

      {/* Quick add child button */}
      {!presentation && selected && !editing && onAddChild && (
        <button
          data-nodrag
          onClick={onAddChild}
          className="absolute top-1/2 -translate-y-1/2 -right-14 size-7 rounded-full bg-primary text-primary-foreground grid place-items-center shadow hover:scale-105"
          title="Adicionar filho (Tab)"
          aria-label="Adicionar filho"
        >
          +
        </button>
      )}

      {/* Toolbar */}
      {selected && !presentation && !editing && (
        <div
          data-nodrag
          className="absolute -bottom-11 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-border/60 bg-popover px-1 py-1 shadow-lg whitespace-nowrap"
        >
          <button
            onClick={onStartEdit}
            className="px-2 py-1 text-xs rounded hover:bg-muted"
          >
            Editar
          </button>
          <button
            onClick={() => onPickImage?.()}
            className="px-2 py-1 text-xs rounded hover:bg-muted flex items-center gap-1"
          >
            <ImageIcon className="size-3" />
            Imagem
          </button>
          <button
            onClick={() => onPickVideo?.()}
            className="px-2 py-1 text-xs rounded hover:bg-muted flex items-center gap-1"
          >
            <Film className="size-3" />
            Vídeo
          </button>
          <button
            onClick={() => setColorMenuOpen((v) => !v)}
            className="px-2 py-1 text-xs rounded hover:bg-muted flex items-center gap-1"
            title="Cor do nó"
          >
            <Palette className="size-3" style={{ color: isThemed ? accent : undefined }} />
            Cor
          </button>

          <div className="h-4 w-px bg-border mx-1" />
          <button
            onClick={onDelete}
            className="px-2 py-1 text-xs rounded text-destructive hover:bg-destructive/10 flex items-center gap-1"
          >
            <Trash2 className="size-3" /> Excluir
          </button>
        </div>
      )}

      {/* Color picker popover */}
      {selected && !presentation && !editing && colorMenuOpen && (
        <div
          data-nodrag
          className="absolute left-1/2 -translate-x-1/2 -bottom-[168px] z-20 w-[240px] rounded-lg border border-border/60 bg-popover p-3 shadow-xl"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
            Cor do nó
          </div>
          <div className="grid grid-cols-5 gap-1.5 mb-2">
            {NODE_COLOR_PALETTE.map((c) => {
              const isCurrent = (node.color ?? "").toLowerCase() === c.value.toLowerCase();
              return (
                <button
                  key={c.value}
                  onClick={() => {
                    onSetColor?.(c.value, cascade && !!hasDescendants);
                    setColorMenuOpen(false);
                  }}
                  className="relative size-8 rounded-full border border-border/60 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                  aria-label={c.name}
                >
                  {isCurrent && (
                    <Check className="size-4 text-white absolute inset-0 m-auto drop-shadow" />
                  )}
                </button>
              );
            })}
          </div>
          {hasDescendants && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={cascade}
                onChange={(e) => setCascade(e.target.checked)}
                className="accent-primary"
              />
              Aplicar a toda a ramificação
            </label>
          )}
          <button
            onClick={() => {
              onSetColor?.(undefined, false);
              setColorMenuOpen(false);
            }}
            className="w-full text-xs rounded-md px-2 py-1.5 border border-border/60 hover:bg-muted"
          >
            {node.color ? "Limpar cor deste nó" : "Sem cor personalizada"}
          </button>
        </div>
      )}

    </div>
  );
}

function NodeMedia({
  node,
  presentation,
  active,
  onClear,
}: {
  node: MindNode;
  presentation?: boolean;
  active?: boolean;
  onClear: () => void;
}) {
  const ref = node.imageRef;
  const legacy = node.image;
  const kind = ref?.kind ?? "image";
  const [url, setUrl] = useState<string | null>(legacy ?? null);
  const [broken, setBroken] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const videoElRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let alive = true;
    if (!ref) {
      setUrl(legacy ?? null);
      setBroken(false);
      return;
    }
    setBroken(false);
    setUrl(null);
    resolveImage(ref).then((u) => {
      if (!alive) return;
      if (u) {
        setUrl(u);
        setBroken(false);
      } else {
        setBroken(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [ref?.id, legacy]);

  // Presentation: pause video when leaving the active node. Never autoplay —
  // the presenter clicks play when they're ready to show it.
  useEffect(() => {
    if (kind !== "video") return;
    const v = videoElRef.current;
    if (!v) return;
    if (!(presentation && active)) {
      try {
        v.pause();
      } catch {
        /* ignore */
      }
    }
  }, [presentation, active, kind, url]);


  if (!ref && !legacy) return null;

  if (broken && ref) {
    return (
      <div className="relative rounded-t-xl border-b border-destructive/40 bg-destructive/10 px-3 py-4 text-xs text-destructive flex items-start gap-2">
        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">
            {kind === "video" ? "Vídeo indisponível" : "Imagem indisponível"}
          </div>
          <div className="text-destructive/80 truncate" title={ref.name}>
            {ref.name}
          </div>
          {!presentation && (
            <button
              data-nodrag
              disabled={reconnecting}
              onClick={async () => {
                setReconnecting(true);
                const u = await requestImageAccess(ref);
                setReconnecting(false);
                if (u) {
                  setUrl(u);
                  setBroken(false);
                }
              }}
              className="mt-1 rounded bg-destructive/20 hover:bg-destructive/30 px-2 py-0.5 text-[11px] font-medium"
            >
              {reconnecting ? "…" : "Reconectar arquivo"}
            </button>
          )}
        </div>
        {!presentation && (
          <button
            data-nodrag
            onClick={onClear}
            className="absolute top-1.5 right-1.5 size-6 grid place-items-center rounded-full bg-background/80 hover:bg-background text-foreground"
            aria-label="Remover"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
    );
  }

  if (!url) {
    return (
      <div className="rounded-t-xl bg-muted/40 animate-pulse" style={{ height: 140 }} />
    );
  }

  return (
    <div className="relative" data-nodrag={kind === "video" ? "" : undefined}>
      {kind === "video" ? (
        <video
          ref={videoElRef}
          src={url}
          controls
          playsInline
          preload="metadata"
          className="w-full max-h-[420px] object-contain rounded-t-xl bg-black"
        />
      ) : (
        <img
          src={url}
          alt=""
          className="w-full max-h-[420px] object-contain rounded-t-xl bg-black/60"
          draggable={false}
        />
      )}

      {!presentation && (
        <button
          data-nodrag
          onClick={onClear}
          className="absolute top-1.5 right-1.5 size-6 grid place-items-center rounded-full bg-background/80 hover:bg-background"
          aria-label="Remover"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
