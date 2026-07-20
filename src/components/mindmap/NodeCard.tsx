import { useEffect, useRef } from "react";
import { Image as ImageIcon, Trash2, X, ChevronRight, ChevronDown } from "lucide-react";
import type { MindNode } from "@/lib/types";

interface Props {
  node: MindNode;
  childCount: number;
  selected: boolean;
  editing: boolean;
  presentation?: boolean;
  active?: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onChange: (patch: Partial<MindNode>) => void;
  onDelete: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  onStartConnect?: (e: React.PointerEvent) => void;
  onAddChild?: () => void;
  onToggleCollapsed?: () => void;
  onImageUpload?: (file: File) => void;
}

export function NodeCard({
  node,
  childCount,
  selected,
  editing,
  presentation,
  active,
  onSelect,
  onStartEdit,
  onEndEdit,
  onChange,
  onDelete,
  onDragStart,
  onStartConnect,
  onAddChild,
  onToggleCollapsed,
  onImageUpload,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editing]);

  const w = node.width ?? 260;
  const accent = node.color ?? "var(--primary)";
  const isRoot = !node.parentId;

  const chromeClass = presentation
    ? active
      ? "border-primary/80 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] ring-2 ring-primary/40"
      : "border-border/20 opacity-25 blur-[1.5px]"
    : selected
      ? "border-primary shadow-[0_10px_30px_-14px_rgba(0,0,0,0.5)]"
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
        borderLeftColor: isRoot ? accent : undefined,
        borderLeftWidth: isRoot ? 4 : 1,
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
      {node.image && (
        <div className="relative">
          <img
            src={node.image}
            alt=""
            className="w-full max-h-56 object-cover rounded-t-xl"
            draggable={false}
          />
          {!presentation && (
            <button
              data-nodrag
              onClick={() => onChange({ image: undefined, imageName: undefined })}
              className="absolute top-1.5 right-1.5 size-6 grid place-items-center rounded-full bg-background/80 hover:bg-background"
              aria-label="Remover imagem"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      )}

      <div className={`px-4 ${node.image ? "py-3" : "py-3"}`}>
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
            onClick={() => fileRef.current?.click()}
            className="px-2 py-1 text-xs rounded hover:bg-muted flex items-center gap-1"
          >
            <ImageIcon className="size-3" />
            Imagem
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImageUpload?.(file);
              e.target.value = "";
            }}
          />
          <div className="h-4 w-px bg-border mx-1" />
          <button
            onClick={onDelete}
            className="px-2 py-1 text-xs rounded text-destructive hover:bg-destructive/10 flex items-center gap-1"
          >
            <Trash2 className="size-3" /> Excluir
          </button>
        </div>
      )}
    </div>
  );
}
