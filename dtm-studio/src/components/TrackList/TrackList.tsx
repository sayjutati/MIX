import type { Instrument, Track } from "../../types/project";
import { isAudioTrack } from "../../types/project";
import { instrumentDisplayName } from "../../data/uiLabels";
import { instrumentEngine } from "../../audio/instrumentVoice";

type Props = {
  tracks: Track[];
  instruments: Instrument[];
  selectedId: string | null;
  overlayTrackIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleOverlay: (id: string) => void;
  onAddTrack: () => void;
  onAddAudioTrack: () => void;
  onRemoveTrack: (id: string) => void;
  onDuplicateTrack: (id: string) => void;
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
  onAddAudioTrack,
  onRemoveTrack,
  onDuplicateTrack,
  onUpdateTrack,
}: Props) {
  const synthInstruments = instruments.filter((i) => instrumentEngine(i) === "synth");
  const drumInstruments = instruments.filter((i) => instrumentEngine(i) === "drum");

  return (
    <aside className="track-list">
      <div className="track-list__head">
        <span className="track-list__title">トラック</span>
        <button
          type="button"
          className="track-list__add tooltip"
          data-tooltip="MIDI トラックを追加"
          onClick={onAddTrack}
          aria-label="MIDIトラック追加"
        >
          +M
        </button>
        <button
          type="button"
          className="track-list__add track-list__add--audio tooltip"
          data-tooltip="オーディオトラックを追加（録音・ファイル取込）"
          onClick={onAddAudioTrack}
          aria-label="オーディオトラック追加"
        >
          +A
        </button>
      </div>
      <p className="track-list__hint">クリック = 編集 · 重ね = ロールに表示</p>
      <ul>
        {tracks.map((t, index) => {
          const num = index + 1;
          const isEdit = t.id === selectedId;
          const isOverlay = overlayTrackIds.has(t.id);
          const isAudio = isAudioTrack(t);
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
                  <span className="track-list__count">
                    {isAudio ? `${(t.clips ?? []).length}クリップ` : `${t.notes.length}音`}
                  </span>
                  {isAudio && <span className="track-list__badge track-list__badge--audio">Audio</span>}
                  {isEdit && <span className="track-list__badge">編集中</span>}
                </button>
                <label
                  className={`track-list__overlay-toggle tooltip${isOverlay ? " is-on" : ""}${isAudio ? " is-disabled" : ""}`}
                  data-tooltip={
                    isAudio
                      ? "オーディオトラックは重ね表示対象外"
                      : `トラック ${num} をピアノロールに重ねて表示`
                  }
                >
                  <input
                    type="checkbox"
                    checked={isOverlay}
                    disabled={isAudio}
                    onChange={() => onToggleOverlay(t.id)}
                  />
                  重ね
                </label>
              </div>
              {isEdit && (
                <div className="track-list__detail">
                  <label className="track-list__name-field">
                    名前
                    <input
                      className="track-list__name-input tooltip"
                      data-tooltip="トラック名（プロジェクト内で識別用）"
                      value={t.name}
                      onChange={(e) => onUpdateTrack(t.id, { name: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="トラック名"
                    />
                  </label>
                  {!isAudio && (
                  <label className="track-list__inst-label">
                    音色
                    <select
                      className="track-list__inst tooltip"
                      data-tooltip="このトラックで使う音源"
                      value={t.instrumentId}
                      onChange={(e) => onUpdateTrack(t.id, { instrumentId: e.target.value })}
                    >
                      <optgroup label="シンセ">
                        {synthInstruments.map((i) => (
                          <option key={i.id} value={i.id}>
                            {instrumentDisplayName(i.kind, i.name)}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="ドラム・パーカッション">
                        {drumInstruments.map((i) => (
                          <option key={i.id} value={i.id}>
                            {instrumentDisplayName(i.kind, i.name)}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </label>
                  )}
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
                  <button
                    type="button"
                    className="track-list__dup tooltip"
                    data-tooltip="トラックを複製（ノート含む）"
                    onClick={() => onDuplicateTrack(t.id)}
                  >
                    トラック複製
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
