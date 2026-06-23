import type { Instrument, Track } from "../../types/project";
import { instrumentDisplayName } from "../../data/uiLabels";

type Props = {
  tracks: Track[];
  instruments: Instrument[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddTrack: () => void;
  onRemoveTrack: (id: string) => void;
  onUpdateTrack: (id: string, patch: Partial<Track>) => void;
};

export function TrackList({
  tracks,
  instruments,
  selectedId,
  onSelect,
  onAddTrack,
  onRemoveTrack,
  onUpdateTrack,
}: Props) {
  return (
    <aside className="track-list">
      <div className="track-list__head">
        <span className="track-list__title">トラック</span>
        <button
          type="button"
          className="track-list__add tooltip"
          data-tooltip="新しいトラックを追加"
          onClick={onAddTrack}
          aria-label="トラック追加"
        >
          +
        </button>
      </div>
      <ul>
        {tracks.map((t) => (
          <li key={t.id} className={t.id === selectedId ? "is-selected" : ""}>
            <button
              type="button"
              className="track-list__item tooltip"
              data-tooltip="クリックで編集対象トラックを切り替え"
              onClick={() => onSelect(t.id)}
            >
              <span className="track-list__dot" style={{ background: t.color }} />
              <span className="track-list__name">{t.name}</span>
              <span className="track-list__count">{t.notes.length}音</span>
            </button>
            {t.id === selectedId && (
              <div className="track-list__detail">
                <label className="track-list__inst-label">
                  音色
                  <select
                    className="track-list__inst tooltip"
                    data-tooltip="このトラックで使うシンセ音色"
                    value={t.instrumentId}
                    onChange={(e) => onUpdateTrack(t.id, { instrumentId: e.target.value })}
                  >
                    {instruments.map((i) => (
                      <option key={i.id} value={i.id}>
                        {instrumentDisplayName(i.kind, i.name)}
                      </option>
                    ))}
                  </select>
                </label>
                {tracks.length > 1 && (
                  <button
                    type="button"
                    className="track-list__remove tooltip"
                    data-tooltip="このトラックを削除"
                    onClick={() => onRemoveTrack(t.id)}
                  >
                    トラック削除
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
