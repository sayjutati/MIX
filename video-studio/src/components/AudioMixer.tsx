import type { EditorApi } from "../hooks/useEditor";
import type { EditorState } from "../types";

interface Props {
  state: EditorState;
  editor: EditorApi;
}

export const AudioMixer = ({ state, editor }: Props) => {
  const audioTracks = state.tracks.filter((t) => t.kind === "audio");
  const anySolo = state.tracks.some((t) => t.solo);

  return (
    <section className="audio-mixer">
      <div className="audio-mixer__master">
        <span className="audio-mixer__label">マスター</span>
        <button
          type="button"
          className={`btn btn--xs ${state.audioEnabled ? "btn--active" : ""}`}
          onClick={() => editor.patch({ audioEnabled: !state.audioEnabled })}
          title="全体の音声モニター"
        >
          {state.audioEnabled ? "🔊" : "🔇"}
        </button>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={state.masterVolume}
          onChange={(e) => editor.patch({ masterVolume: Number(e.target.value) })}
          className="audio-mixer__fader"
        />
        <span className="audio-mixer__val">{Math.round(state.masterVolume * 100)}%</span>
      </div>

      <div className="audio-mixer__tracks">
        {audioTracks.map((track) => (
          <div key={track.id} className="audio-mixer__strip">
            <span className="audio-mixer__track-name" title={track.name}>
              {track.name}
            </span>
            <button
              type="button"
              className={`btn btn--xs ${track.solo ? "btn--solo" : ""}`}
              onClick={() => editor.toggleSolo(track.id)}
              title="ソロ（他トラックを消音）"
            >
              S
            </button>
            <button
              type="button"
              className={`btn btn--xs ${track.muted ? "btn--mute" : ""}`}
              onClick={() => editor.toggleTrack(track.id, "muted")}
              title="ミュート"
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
            />
          </div>
        ))}
      </div>

      <p className="audio-mixer__hint">
        動画の音は <strong>Audio トラック（動画から抽出）</strong>、DAW の音は{" "}
        <strong>Audio 2（BGM/DAW）</strong> — 別ソースです。クリップの 🔊 で個別 ON/OFF。
      </p>
    </section>
  );
};
