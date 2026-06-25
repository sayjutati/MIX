import type { Track } from "../../types/project";

type Props = {
  tracks: Track[];
  selectedId: string | null;
  masterVolume: number;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Track>) => void;
  onMasterVolumeChange: (v: number) => void;
};

export function MixerPanel({
  tracks,
  selectedId,
  masterVolume,
  onSelect,
  onUpdate,
  onMasterVolumeChange,
}: Props) {
  const toggleSolo = (t: Track) => {
    const next = !t.solo;
    if (next) {
      tracks.forEach((tr) => {
        if (tr.id !== t.id && tr.solo) onUpdate(tr.id, { solo: false });
      });
    }
    onUpdate(t.id, { solo: next });
  };

  return (
    <footer className="mixer">
      <div className="mixer__master tooltip" data-tooltip="マスター出力">
        <span className="mixer__label">MST</span>
        <div className="mixer__fader-v">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            className="mixer__fader-v-input"
            onChange={(e) => onMasterVolumeChange(Number(e.target.value))}
            aria-label="マスター音量"
          />
        </div>
        <span className="mixer__val">{Math.round(masterVolume * 100)}</span>
      </div>
      <div className="mixer__strips">
        {tracks.map((t) => (
          <div
            key={t.id}
            className={`mixer__strip tooltip${t.id === selectedId ? " is-selected" : ""}`}
            data-tooltip="クリックで編集トラックを選択"
            onClick={() => onSelect(t.id)}
          >
            <div className="mixer__strip-name" style={{ borderColor: t.color }}>
              {t.name}
            </div>
            <div className="mixer__meter" aria-hidden>
              <div className="mixer__meter-fill" style={{ height: `${Math.round(t.volume * 100)}%` }} />
            </div>
            <div className="mixer__fader-v">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={t.volume}
                className="mixer__fader-v-input"
                onChange={(e) => onUpdate(t.id, { volume: Number(e.target.value) })}
                onClick={(e) => e.stopPropagation()}
                aria-label={`${t.name} 音量`}
              />
            </div>
            <label className="mixer__pan-row" onClick={(e) => e.stopPropagation()}>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={t.pan}
                onChange={(e) => onUpdate(t.id, { pan: Number(e.target.value) })}
                aria-label={`${t.name} パン`}
              />
            </label>
            <div className="mixer__buttons">
              <button
                type="button"
                className={`mixer__btn tooltip${t.muted ? " is-on" : ""}`}
                data-tooltip="ミュート"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate(t.id, { muted: !t.muted });
                }}
              >
                M
              </button>
              <button
                type="button"
                className={`mixer__btn mixer__btn--solo tooltip${t.solo ? " is-on" : ""}`}
                data-tooltip="ソロ"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSolo(t);
                }}
              >
                S
              </button>
            </div>
          </div>
        ))}
      </div>
    </footer>
  );
}
