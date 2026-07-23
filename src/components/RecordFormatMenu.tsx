import { X } from "lucide-react";
import { RECORD_FORMATS, type RecordFormat } from "@/lib/recordFormats";

export function RecordFormatMenu({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (fmt: RecordFormat) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-border/60 bg-card shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Formato da gravação</div>
            <div className="text-xs text-muted-foreground">Escolha o tamanho do vídeo final.</div>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-3 grid gap-2">
          {RECORD_FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => onPick(f)}
              className="text-left p-3 rounded-lg border border-border/60 hover:border-primary hover:bg-muted/50 transition flex items-center justify-between gap-3"
            >
              <div>
                <div className="font-medium text-sm">{f.label}</div>
                {f.hint && <div className="text-xs text-muted-foreground">{f.hint}</div>}
              </div>
              <div
                className="rounded border border-border/60 bg-background shrink-0"
                style={{ width: 48, height: Math.min(64, 48 * (f.height / f.width)) }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
