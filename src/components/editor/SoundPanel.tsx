import { useMemo } from "react";
import { Volume2, VolumeX, RefreshCw, Trash2, Power } from "lucide-react";
import type { Project, SfxEvent, SfxKind } from "@/lib/types";
import { useStore } from "@/lib/store";
import { SOUND_PRESETS } from "@/lib/sfxPresets";
import { SFX_ASSETS, getAssetsForKind } from "@/lib/sfxAssets";
import { sfxService } from "@/lib/sfxService";

const SFX_KINDS: SfxKind[] = [
  "whoosh_soft",
  "whoosh_deep",
  "focus_click",
  "text_pop",
  "zoom_riser",
  "low_impact",
  "transition_air",
  "subtle_hit",
  "marker_tick",
];

export function SoundPanel({ project }: { project: Project }) {
  const playback = useStore((s) => s.playback);
  const setMuted = useStore((s) => s.setSfxMuted);
  const setVol = useStore((s) => s.setSfxMasterVolume);
  const setPreset = useStore((s) => s.setSoundPreset);
  const updatePreset = useStore((s) => s.updateSoundPreset);
  const regenerate = useStore((s) => s.regenerateSfx);
  const toggleEvt = useStore((s) => s.toggleSfxEvent);
  const updateEvt = useStore((s) => s.updateSfxEvent);
  const removeEvt = useStore((s) => s.removeSfxEvent);

  const preset = project.soundPreset;
  const events = useMemo(
    () => [...project.sfx].sort((a, b) => a.time - b.time),
    [project.sfx],
  );

  const credits = useMemo(() => {
    const ids = new Set(project.sfx.map((e) => e.soundId).filter(Boolean) as string[]);
    return SFX_ASSETS.filter((a) => ids.has(a.id) && a.attributionRequired);
  }, [project.sfx]);

  return (
    <div className="h-full overflow-y-auto p-6 max-w-4xl mx-auto">
      <header className="mb-6">
        <h2 className="text-display text-lg">Som & SFX</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Efeitos sincronizados com câmera e foco de nós. Todos os sons padrão
          são gerados proceduralmente (CC0). Para adicionar SFX públicos reais,
          veja <code className="text-mono">public/sfx/README.md</code>.
        </p>
      </header>

      <section className="surface-card p-4 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => {
              sfxService.setMuted(!playback.sfxMuted);
              setMuted(!playback.sfxMuted);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs ${
              playback.sfxMuted
                ? "border-destructive/60 text-destructive"
                : "border-primary/60 text-primary"
            }`}
          >
            {playback.sfxMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            {playback.sfxMuted ? "SFX desligado" : "SFX ligado"}
          </button>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={playback.sfxMasterVolume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVol(v);
                sfxService.setMasterVolume(v);
              }}
              className="w-32 accent-primary"
            />
            <span className="text-mono w-10 text-right">
              {Math.round(playback.sfxMasterVolume * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Preset</span>
            <select
              value={preset.id}
              onChange={(e) => setPreset(project.id, e.target.value)}
              className="bg-background border border-border/60 rounded px-2 py-1 text-xs"
            >
              {SOUND_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => regenerate(project.id)}
            className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded border border-border/60 text-xs hover:bg-muted/50"
          >
            <RefreshCw className="size-3.5" />
            Regenerar SFX
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-4 text-xs">
          <Toggle
            label="Whoosh em movimento de câmera"
            checked={preset.playWhooshOnCameraMove}
            onChange={(v) => updatePreset(project.id, { playWhooshOnCameraMove: v })}
          />
          <Toggle
            label="Click no foco do nó"
            checked={preset.playClickOnNodeFocus}
            onChange={(v) => updatePreset(project.id, { playClickOnNodeFocus: v })}
          />
          <Toggle
            label="Impact em ideias fortes"
            checked={preset.playImpactOnStrongIdea}
            onChange={(v) => updatePreset(project.id, { playImpactOnStrongIdea: v })}
          />
          <Toggle
            label="Duck na fala"
            checked={preset.duckOnSpeech}
            onChange={(v) => updatePreset(project.id, { duckOnSpeech: v })}
          />
          <Slider
            label="Frequência"
            value={preset.frequency}
            onChange={(v) => updatePreset(project.id, { frequency: v })}
          />
          <Slider
            label="Intensidade"
            value={preset.intensity}
            onChange={(v) => updatePreset(project.id, { intensity: v })}
          />
        </div>
      </section>

      <section className="surface-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-display text-sm">Eventos de som ({events.length})</h3>
          <span className="text-[10px] text-muted-foreground text-mono">
            duração {Math.floor(project.durationSec)}s
          </span>
        </div>

        {events.length === 0 ? (
          <div className="text-xs text-muted-foreground py-8 text-center">
            Nenhum evento. Clique em <em>Regenerar SFX</em>.
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {events.map((e) => (
              <SfxRow
                key={e.id}
                event={e}
                onToggle={() => toggleEvt(project.id, e.id)}
                onRemove={() => removeEvt(project.id, e.id)}
                onChangeSound={(soundId) => updateEvt(project.id, e.id, { soundId })}
                onPreview={() => sfxService.playEvent(e, preset)}
                onChangeVolume={(v) => updateEvt(project.id, e.id, { volume: v })}
              />
            ))}
          </ul>
        )}
      </section>

      {credits.length > 0 && (
        <section className="mt-5 surface-card p-4 text-xs">
          <h3 className="text-display text-sm mb-2">Créditos obrigatórios</h3>
          <ul className="space-y-1">
            {credits.map((a) => (
              <li key={a.id} className="text-muted-foreground">
                <span className="text-foreground">{a.name}</span> — {a.author} (
                {a.license}) ·{" "}
                <a href={a.sourceUrl} target="_blank" rel="noreferrer" className="text-primary">
                  fonte
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[10px] text-muted-foreground/70 mt-6">
        Bibliotecas usadas: Web Audio API nativa (sem dependências). Para sons
        reais com licença CC0/CC-BY, adicione arquivos em{" "}
        <code className="text-mono">public/sfx/</code> e registre-os em{" "}
        <code className="text-mono">src/lib/sfxAssets.ts</code>.
      </p>
    </div>
  );
}

function SfxRow({
  event,
  onToggle,
  onRemove,
  onChangeSound,
  onChangeVolume,
  onPreview,
}: {
  event: SfxEvent;
  onToggle: () => void;
  onRemove: () => void;
  onChangeSound: (id: string) => void;
  onChangeVolume: (v: number) => void;
  onPreview: () => void;
}) {
  const candidates = getAssetsForKind(event.kind);
  const enabled = event.enabled !== false;
  return (
    <li className="py-2 flex items-center gap-3 text-xs">
      <button
        onClick={onToggle}
        className={`size-6 rounded grid place-items-center border ${
          enabled ? "border-primary/60 text-primary" : "border-border/40 text-muted-foreground/40"
        }`}
        title={enabled ? "Desativar" : "Ativar"}
      >
        <Power className="size-3" />
      </button>
      <span className="text-mono w-14 text-muted-foreground">{event.time.toFixed(2)}s</span>
      <span className="w-28 truncate text-foreground/90">{event.kind}</span>
      <span className="text-[10px] text-muted-foreground w-20">{event.trigger ?? "—"}</span>
      <select
        value={event.soundId ?? ""}
        onChange={(e) => onChangeSound(e.target.value)}
        className="flex-1 bg-background border border-border/60 rounded px-2 py-1 text-xs"
      >
        {candidates.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.license})
          </option>
        ))}
      </select>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={event.volume}
        onChange={(e) => onChangeVolume(Number(e.target.value))}
        className="w-20 accent-primary"
      />
      <button
        onClick={onPreview}
        className="px-2 py-1 rounded border border-border/60 hover:bg-muted/50 text-[11px]"
      >
        ▶
      </button>
      <button
        onClick={onRemove}
        className="size-6 rounded grid place-items-center text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-3" />
      </button>
    </li>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary"
      />
      <span className="text-foreground/80">{label}</span>
    </label>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-24">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-primary"
      />
      <span className="text-mono w-10 text-right">{Math.round(value * 100)}%</span>
    </div>
  );
}

// satisfy unused-import warning
void SFX_KINDS;
