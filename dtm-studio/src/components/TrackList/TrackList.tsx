import type { Instrument, Track } from "../../types/project";

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
        <span className="track-list__title">Tracks</span>
        <button type="button" className="track-list__add" onClick={onAddTrack} title="トラック追加">
          +
        </button>
      </div>
      <ul>
        {tracks.map((t) => (
          <li key={t.id} className={t.id === selectedId ? "is-selected" : ""}>
            <button type="button" className="track-list__item" onClick={() => onSelect(t.id)}>
              <span className="track-list__dot" style={{ background: t.color }} />
              <span className="track-list__name">{t.name}</span>
              <span className="track-list__count">{t.notes.length}</span>
            </button>
            {t.id === selectedId && (
              <div className="track-list__detail">
                <select
                  className="track-list__inst"
                  value={t.instrumentId}
                  onChange={(e) => onUpdateTrack(t.id, { instrumentId: e.target.value })}
                >
                  {instruments.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                {tracks.length > 1 && (
                  <button
                    type="button"
                    className="track-list__remove"
                    onClick={() => onRemoveTrack(t.id)}
                  >
                    削除
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
