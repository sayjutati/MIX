import { Eye, EyeOff, Film, Image, Lock, Music, Trash2, Type, Unlock } from "lucide-react";
import type { EditorApi } from "../hooks/useEditor";
import type { Track } from "../types";

interface Props {
  track: Track;
  selected: boolean;
  canRemove: boolean;
  editor: EditorApi;
  anySolo: boolean;
}

const kindIcon = (kind: Track["kind"]) => {
  if (kind === "video") return <Film size={13} />;
  if (kind === "audio") return <Music size={13} />;
  if (kind === "text") return <Type size={13} />;
  return <Image size={13} />;
};

export const TrackHeader = ({ track, selected, canRemove, editor, anySolo }: Props) => (
  <div
    className={`track-header ${selected ? "track-header--selected" : ""} ${track.locked ? "track-header--locked" : ""}`}
    onClick={() => editor.patch({ selectedTrackId: track.id })}
  >
    <span className="track-header__stripe" style={{ background: track.color }} />
    <span className="track-header__icon" style={{ color: track.color }}>
      {kindIcon(track.kind)}
    </span>
    <span className="track-header__name" title={track.name}>
      {track.name}
    </span>

    <div className="track-header__controls" onClick={(e) => e.stopPropagation()}>
      {track.kind === "audio" && (
        <>
          <button
            type="button"
            className={`track-header__btn ${track.solo ? "track-header__btn--solo" : ""}`}
            onClick={() => editor.toggleSolo(track.id)}
            title="ソロ再生 (S)"
          >
            S
          </button>
          <button
            type="button"
            className={`track-header__btn ${track.muted ? "track-header__btn--mute" : ""}`}
            onClick={() => editor.toggleTrack(track.id, "muted")}
            title="トラックをミュート"
            disabled={anySolo && !track.solo}
          >
            M
          </button>
        </>
      )}

      {track.kind !== "audio" && (
        <button
          type="button"
          className={`track-header__btn ${track.hidden ? "track-header__btn--mute" : ""}`}
          onClick={() => editor.toggleTrack(track.id, "hidden")}
          title={track.hidden ? "トラックを表示" : "トラックを非表示"}
        >
          {track.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      )}

      <button
        type="button"
        className={`track-header__btn ${track.locked ? "track-header__btn--active" : ""}`}
        onClick={() => editor.toggleTrack(track.id, "locked")}
        title={track.locked ? "ロック解除" : "誤操作防止ロック"}
      >
        {track.locked ? <Lock size={12} /> : <Unlock size={12} />}
      </button>

      {canRemove && (
        <button
          type="button"
          className="track-header__btn track-header__btn--del"
          onClick={() => editor.removeTrack(track.id)}
          title="空のトラックを削除"
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  </div>
);
