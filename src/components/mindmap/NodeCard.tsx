import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Trash2, X } from "lucide-react";
import type { MindNode } from "@/lib/types";

interface Props {
  node: MindNode;
  selected: boolean;
  orderIndex: number | null;
  onSelect: () => void;
  onChange: (patch: Partial<MindNode>) => void;
  onDelete: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  presentation?: boolean;
  active?: boolean;
}

export function NodeCard({
  node,
  selected,
  orderIndex,
  onSelect,
  onChange,
  onDelete,
  onDragStart,
  presentation,
  active,
}: Props) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editing]);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange({ image: reader.result as string, imageName: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const w = node.width ?? 360;
  const accent = node.color ?? "hsl(var(--primary))";

  return (
    <div
      className={`absolute rounded-2xl border bg-card/95 backdrop-blur transition-shadow ${
        presentation
          ? active
            ? "border-primary/60 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]"
            : "border-border/40 opacity-70"
          : selected
            ? "border-primary shadow-[0_16px_40px_-16px_rgba(0,0,0,0.5)]"
            : "border-border/60 hover:border-border"
      }`}
      style={{
        left: node.x - w / 2,
        top: node.y,
        width: w,
        transform: "translateY(-50%)",
        borderTopColor: active || selected ? accent : undefined,
        borderTopWidth: active || selected ? 3 : 1,
      }}
      onPointerDown={(e) => {
        if (presentation) return;
        if ((e.target as HTMLElement).closest("[data-nodrag]")) return;
        onSelect();
        onDragStart(e);
      }}
      onDoubleClick={() => !presentation && setEditing(true)}
    >
      {orderIndex !== null && (
        <div
          className="absolute -top-3 -left-3 size-7 rounded-full grid place-items-center text-[11px] font-mono font-semibold text-primary-foreground shadow"
          style={{ background: accent }}
        >
          {orderIndex + 1}
        </div>
      )}

      {node.image && (
        <div className="relative">
          <img
            src={node.image}
            alt=""
            className="w-full max-h-64 object-cover rounded-t-2xl"
            draggable={false}
          />
          {!presentation && (
            <button
              data-nodrag
              onClick={() => onChange({ image: undefined, imageName: undefined })}
              className="absolute top-2 right-2 size-7 grid place-items-center rounded-full bg-background/80 hover:bg-background text-foreground"
              aria-label="Remover imagem"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="p-5">
        {editing && !presentation ? (
          <textarea
            ref={textareaRef}
            data-nodrag
            value={node.text}
            onChange={(e) => onChange({ text: e.target.value })}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) setEditing(false);
            }}
            rows={Math.max(2, node.text.split("\n").length)}
            className="w-full bg-transparent outline-none resize-none text-lg leading-snug"
          />
        ) : (
          <p
            className={`whitespace-pre-wrap leading-snug ${
              presentation ? "text-2xl md:text-3xl" : "text-lg"
            } ${node.text ? "text-foreground" : "text-muted-foreground italic"}`}
          >
            {node.text || "Duplo clique para editar"}
          </p>
        )}
      </div>

      {selected && !presentation && !editing && (
        <div
          data-nodrag
          className="absolute -bottom-11 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-border/60 bg-popover px-1 py-1 shadow-lg"
        >
          <button
            onClick={() => setEditing(true)}
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
            onChange={handleUpload}
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
