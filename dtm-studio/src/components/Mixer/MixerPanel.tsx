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
      <div className="mixer__master tooltip" data-tooltip="全体の出力音量">
        <span className="mixer__label">マスター</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={masterVolume}
          onChange={(e) => onMasterVolumeChange(Number(e.target.value))}
        />
        <span className="mixer__val">{Math.round(masterVolume * 100)}%</span>
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
            <label className="mixer__fader tooltip" data-tooltip="トラック音量">
              <span>音量</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={t.volume}
                onChange={(e) => onUpdate(t.id, { volume: Number(e.target.value) })}
                onClick={(e) => e.stopPropagation()}
              />
              <span className="mixer__val">{Math.round(t.volume * 100)}%</span>
            </label>
            <label className="mixer__fader mixer__fader--pan tooltip" data-tooltip="左右の定位（L〜R）">
              <span>パン</span>
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
                className={`mixer__btn tooltip${t.muted ? " is-on" : ""}`}
                data-tooltip="ミュート：このトラックの音を消す"
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
                data-tooltip="ソロ：このトラックだけ聴く"
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
