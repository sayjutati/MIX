import type { Instrument, LaneRole, Track } from "../../types/project";
import { INSTRUMENT_GROUPS, instrumentDisplayName } from "../../data/uiLabels";
import { audioTracks, kindsForRole, LANE_ROLES, resolveTrackRole, tracksInRole } from "../../utils/laneRole";

type Props = {
  tracks: Track[];
  instruments: Instrument[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddToRole: (role: LaneRole) => void;
  onAddAudioTrack: () => void;
  onAddVoiceTrack: () => void;
  onRemoveTrack: (id: string) => void;
  onDuplicateTrack: (id: string) => void;
  onUpdateTrack: (id: string, patch: Partial<Track>) => void;
};

export function TrackList({
  tracks,
  instruments,
  selectedId,
  onSelect,
  onAddToRole,
  onAddAudioTrack,
  onAddVoiceTrack,
  onRemoveTrack,
  onDuplicateTrack,
  onUpdateTrack,
}: Props) {
  const extras = audioTracks(tracks);

  return (
    <aside className="track-list">
      <div className="track-list__head">
        <span className="track-list__title">編成</span>
        <button
          type="button"
          className="track-list__add track-list__add--audio tooltip"
          data-tooltip="オーディオトラックを追加"
          onClick={onAddAudioTrack}
          aria-label="オーディオトラック追加"
        >
          +A
        </button>
      </div>
      <p className="track-list__hint">枠の中に楽器を追加。同じ枠は重ねて鳴る。色で見分けます。</p>

      {LANE_ROLES.map((lane) => {
        const members = tracksInRole(tracks, instruments, lane.id);
        const kinds = kindsForRole(lane.id);
        return (
          <section key={lane.id} className="lane-group">
            <header className="lane-group__head" style={{ borderLeftColor: lane.accent }}>
              <div>
                <h3>{lane.label}</h3>
                <p>{lane.hint}</p>
              </div>
              <div className="lane-group__actions">
                {lane.id === "melody" && (
                  <button
                    type="button"
                    className="track-list__add track-list__add--voice tooltip"
                    data-tooltip="声を録音してメロディ枠に追加"
                    onClick={onAddVoiceTrack}
                  >
                    +声
                  </button>
                )}
                <button
                  type="button"
                  className="track-list__add tooltip"
                  data-tooltip={`${lane.label}に楽器を追加`}
                  onClick={() => onAddToRole(lane.id)}
                >
                  +
                </button>
              </div>
            </header>
            {members.length === 0 ? (
              <p className="lane-group__empty">＋ で楽器を追加</p>
            ) : (
              <ul>
                {members.map((t) => {
                  const isEdit = t.id === selectedId;
                  return (
                    <li key={t.id} className={isEdit ? "is-selected" : ""}>
                      <div className="track-list__row">
                        <input
                          type="color"
                          className="track-list__color"
                          value={normalizeHex(t.color)}
                          title="色を変更"
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => onUpdateTrack(t.id, { color: e.target.value })}
                        />
                        <button
                          type="button"
                          className="track-list__item tooltip"
                          data-tooltip={`${t.name} を編集（この色でノートを描く）`}
                          onClick={() => onSelect(t.id)}
                        >
                          <span className="track-list__name">{t.name}</span>
                          <span className="track-list__count">{t.notes.length}音</span>
                          {isEdit && <span className="track-list__badge">編集中</span>}
                        </button>
                        <div className="track-list__ms">
                          <button
                            type="button"
                            className={`track-list__ms-btn${t.muted ? " is-on" : ""}`}
                            title="ミュート"
                            onClick={() => onUpdateTrack(t.id, { muted: !t.muted })}
                          >
                            M
                          </button>
                          <button
                            type="button"
                            className={`track-list__ms-btn track-list__ms-btn--solo${t.solo ? " is-on" : ""}`}
                            title="ソロ"
                            onClick={() => {
                              if (!t.solo) {
                                tracks.forEach((tr) => {
                                  if (tr.id !== t.id && tr.solo) onUpdateTrack(tr.id, { solo: false });
                                });
                              }
                              onUpdateTrack(t.id, { solo: !t.solo });
                            }}
                          >
                            S
                          </button>
                        </div>
                      </div>
                      {isEdit && (
                        <div className="track-list__detail">
                          <label className="track-list__name-field">
                            名前
                            <input
                              className="track-list__name-input"
                              value={t.name}
                              onChange={(e) => onUpdateTrack(t.id, { name: e.target.value })}
                            />
                          </label>
                          <label className="track-list__inst-label">
                            音色
                            <select
                              className="track-list__inst"
                              value={t.instrumentId}
                              onChange={(e) => {
                                const next = instruments.find((i) => i.id === e.target.value);
                                onUpdateTrack(t.id, {
                                  instrumentId: e.target.value,
                                  role: resolveTrackRole(
                                    { ...t, instrumentId: e.target.value, role: undefined },
                                    instruments
                                  ),
                                  name: next ? instrumentDisplayName(next.kind, next.name) : t.name,
                                });
                              }}
                            >
                              {INSTRUMENT_GROUPS.filter((g) => g.kinds.some((k) => kinds.includes(k))).map(
                                (group) => {
                                  const items = instruments.filter(
                                    (i) => group.kinds.includes(i.kind) && kinds.includes(i.kind)
                                  );
                                  if (!items.length) return null;
                                  return (
                                    <optgroup key={group.label} label={group.label}>
                                      {items.map((i) => (
                                        <option key={i.id} value={i.id}>
                                          {instrumentDisplayName(i.kind, i.name)}
                                        </option>
                                      ))}
                                    </optgroup>
                                  );
                                }
                              )}
                            </select>
                          </label>
                          {tracks.length > 1 && (
                            <button
                              type="button"
                              className="track-list__remove"
                              onClick={() => onRemoveTrack(t.id)}
                            >
                              この楽器を外す
                            </button>
                          )}
                          <button
                            type="button"
                            className="track-list__dup"
                            onClick={() => onDuplicateTrack(t.id)}
                          >
                            複製
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {extras.length > 0 && (
        <section className="lane-group">
          <header className="lane-group__head" style={{ borderLeftColor: "#94a3b8" }}>
            <div>
              <h3>オーディオ</h3>
              <p>録音・ファイル</p>
            </div>
          </header>
          <ul>
            {extras.map((t) => {
              const isEdit = t.id === selectedId;
              return (
                <li key={t.id} className={isEdit ? "is-selected" : ""}>
                  <div className="track-list__row">
                    <button type="button" className="track-list__item" onClick={() => onSelect(t.id)}>
                      <span className="track-list__dot" style={{ background: t.color }} />
                      <span className="track-list__name">{t.name}</span>
                      <span className="track-list__badge track-list__badge--audio">Audio</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </aside>
  );
}

const normalizeHex = (c: string) => (c.startsWith("#") && (c.length === 7 || c.length === 4) ? c : "#888888");
