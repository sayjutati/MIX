import type { Track } from "../../types/project";

type Props = {
  tracks: Track[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Track>) => void;
};

export function MixerPanel({ tracks, selectedId, onSelect, onUpdate }: Props) {
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
      <div className="mixer__label">Mixer</div>
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
            <label className="mixer__fader">
              <span>Vol</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={t.volume}
                onChange={(e) => onUpdate(t.id, { volume: Number(e.target.value) })}
                onClick={(e) => e.stopPropagation()}
              />
              <span className="mixer__val">{Math.round(t.volume * 100)}</span>
            </label>
            <label className="mixer__fader mixer__fader--pan">
              <span>Pan</span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={t.pan}
                onChange={(e) => onUpdate(t.id, { pan: Number(e.target.value) })}
                onClick={(e) => e.stopPropagation()}
              />
            </label>
            <div className="mixer__buttons">
              <button
                type="button"
                className={`mixer__btn${t.muted ? " is-on" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate(t.id, { muted: !t.muted });
                }}
              >
                M
              </button>
              <button
                type="button"
                className={`mixer__btn mixer__btn--solo${t.solo ? " is-on" : ""}`}
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
