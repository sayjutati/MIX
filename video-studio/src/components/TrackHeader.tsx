import type { EditorApi } from "../hooks/useEditor";
import type { Track } from "../types";

interface Props {
  track: Track;
  editor: EditorApi;
  anySolo: boolean;
}

export const TrackHeader = ({ track, editor, anySolo }: Props) => (
  <div className="track-header">
    <span className="track-header__dot" style={{ background: track.color }} />
    <span className="track-header__name" title={track.name}>
      {track.name}
    </span>
    {track.kind === "audio" && (
      <>
        <button
          type="button"
          className={`track-header__btn ${track.solo ? "track-header__btn--solo" : ""}`}
          onClick={() => editor.toggleSolo(track.id)}
          title="ソロ"
        >
          S
        </button>
        <button
          type="button"
          className={`track-header__btn ${track.muted ? "track-header__btn--mute" : ""}`}
          onClick={() => editor.toggleTrack(track.id, "muted")}
          title="ミュート"
          disabled={anySolo && !track.solo}
        >
          M
        </button>
      </>
    )}
    {track.kind === "video" && (
      <button
        type="button"
        className={`track-header__btn ${track.hidden ? "track-header__btn--active" : ""}`}
        onClick={() => editor.toggleTrack(track.id, "hidden")}
        title="映像の表示/非表示"
      >
        V
      </button>
    )}
    <button
      type="button"
      className={`track-header__btn ${track.locked ? "track-header__btn--active" : ""}`}
      onClick={() => editor.toggleTrack(track.id, "locked")}
      title="ロック"
    >
      🔒
    </button>
  </div>
);
