import { ChevronDown, ChevronUp, Volume2 } from "lucide-react";
import type { EditorApi } from "../hooks/useEditor";
import type { EditorState } from "../types";

interface Props {
  state: EditorState;
  editor: EditorApi;
  open: boolean;
  compact: boolean;
  onToggleOpen: () => void;
}

export const AudioMixer = ({ state, editor, open, compact, onToggleOpen }: Props) => {
  const audioTracks = state.tracks.filter((t) => t.kind === "audio");
  const anySolo = state.tracks.some((t) => t.solo);

  return (
    <section className={`audio-mixer ${open ? "" : "audio-mixer--collapsed"} ${compact ? "audio-mixer--compact" : ""}`}>
      <button type="button" className="audio-mixer__toggle" onClick={onToggleOpen}>
        <Volume2 size={16} />
        <span>音声ミキサー</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="audio-mixer__body">
          <div className="audio-mixer__strips">
            {audioTracks.map((track) => (
              <div key={track.id} className="audio-mixer__strip">
                <span className="audio-mixer__name" title={track.name}>
                  {track.name.replace(/（.+）/, "")}
                </span>
                <button
                  type="button"
                  className={`mixer-btn ${track.solo ? "mixer-btn--solo" : ""}`}
                  onClick={() => editor.toggleSolo(track.id)}
                  title="ソロ"
                >
                  S
                </button>
                <button
                  type="button"
                  className={`mixer-btn ${track.muted ? "mixer-btn--mute" : ""}`}
                  onClick={() => editor.toggleTrack(track.id, "muted")}
                  title="ミュート"
                  disabled={anySolo && !track.solo}
                >
                  M
                </button>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={track.volume}
                  onChange={(e) => editor.setTrackVolume(track.id, Number(e.target.value))}
                  className="audio-mixer__fader"
                  disabled={track.muted || (anySolo && !track.solo)}
                  aria-label={`${track.name} 音量`}
                />
                <span className="audio-mixer__pct">{Math.round(track.volume * 100)}</span>
              </div>
            ))}
          </div>
          {!compact && (
            <p className="audio-mixer__hint">
              動画の元音＝Audio 1（青）／ DAW ミックス＝Audio 2（緑）。クリップの 🔊 で個別に消せます。
            </p>
          )}
        </div>
      )}
    </section>
  );
};
