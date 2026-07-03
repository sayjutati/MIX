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
    <div className="mixer">
      <div className="mixer__master">
        <div className="mixer__strip-name mixer__strip-name--master">MASTER</div>
        <div className="mixer__strip-body">
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
      </div>
      <div className="mixer__strips">
        {tracks.map((t) => (
          <div
            key={t.id}
            className={`mixer__strip${t.id === selectedId ? " is-selected" : ""}`}
            onClick={() => onSelect(t.id)}
          >
            <div className="mixer__strip-name" style={{ borderColor: t.color }}>
              {t.name}
            </div>
            <div className="mixer__strip-body">
              <div className="mixer__meter" aria-hidden>
                <div
                  className="mixer__meter-fill"
                  style={{ height: `${Math.round(t.volume * 100)}%` }}
                />
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
              <span className="mixer__val">{Math.round(t.volume * 100)}</span>
            </div>
            <label
              className="mixer__pan-row tooltip"
              data-tooltip="パン（左右バランス）"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={t.pan}
                onChange={(e) => onUpdate(t.id, { pan: Number(e.target.value) })}
                onDoubleClick={() => onUpdate(t.id, { pan: 0 })}
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
    </div>
  );
}
