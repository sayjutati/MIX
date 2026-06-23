import type { Instrument, Track } from "../../types/project";
import { instrumentDisplayName } from "../../data/uiLabels";

type Props = {
  tracks: Track[];
  instruments: Instrument[];
  selectedId: string | null;
  overlayTrackIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleOverlay: (id: string) => void;
  onAddTrack: () => void;
  onRemoveTrack: (id: string) => void;
  onUpdateTrack: (id: string, patch: Partial<Track>) => void;
};

export function TrackList({
  tracks,
  instruments,
  selectedId,
  overlayTrackIds,
  onSelect,
  onToggleOverlay,
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
      <p className="track-list__hint">クリック = 編集 · 重ね = ロールに表示</p>
      <ul>
        {tracks.map((t, index) => {
          const num = index + 1;
          const isEdit = t.id === selectedId;
          const isOverlay = overlayTrackIds.has(t.id);
          return (
            <li
              key={t.id}
              className={`${isEdit ? "is-selected" : ""}${isOverlay ? " is-overlay" : ""}`}
            >
              <div className="track-list__row">
                <button
                  type="button"
                  className="track-list__item tooltip"
                  data-tooltip={`トラック ${num} を編集対象にする`}
                  onClick={() => onSelect(t.id)}
                >
                  <span className="track-list__num">{num}</span>
                  <span className="track-list__dot" style={{ background: t.color }} />
                  <span className="track-list__name">{t.name}</span>
                  <span className="track-list__count">{t.notes.length}音</span>
                  {isEdit && <span className="track-list__badge">編集中</span>}
                </button>
                <label
                  className={`track-list__overlay-toggle tooltip${isOverlay ? " is-on" : ""}`}
                  data-tooltip={`トラック ${num} をピアノロールに重ねて表示`}
                >
                  <input
                    type="checkbox"
                    checked={isOverlay}
                    onChange={() => onToggleOverlay(t.id)}
                  />
                  重ね
                </label>
              </div>
              {isEdit && (
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
          );
        })}
      </ul>
    </aside>
  );
}
