import type { EditorState } from "../types";
import { formatTime } from "../utils/time";

interface Props {
  state: EditorState;
  onPlay: () => void;
  onStop: () => void;
  onSeek: (t: number) => void;
  onZoom: (delta: number) => void;
  onSetLoop: (which: "A" | "B") => void;
  onClearLoop: () => void;
  onMasterVolume: (v: number) => void;
  onToggleAudio: () => void;
}

export const TransportBar = ({
  state,
  onPlay,
  onStop,
  onSeek,
  onZoom,
  onSetLoop,
  onClearLoop,
  onMasterVolume,
  onToggleAudio,
}: Props) => (
  <div className="transport">
    <button type="button" className="btn btn--icon" onClick={onPlay} title="再生 (Space)">
      {state.isPlaying ? "⏸" : "▶"}
    </button>
    <button type="button" className="btn btn--icon" onClick={onStop} title="停止">
      ⏹
    </button>
    <span className="transport__time">
      {formatTime(state.playhead)} / {formatTime(state.duration)}
    </span>
    <input
      type="range"
      className="transport__scrub"
      min={0}
      max={state.duration}
      step={0.01}
      value={state.playhead}
      onChange={(e) => onSeek(Number(e.target.value))}
    />
    <button type="button" className="btn btn--sm" onClick={() => onZoom(10)} title="ズームイン (+)">
      +
    </button>
    <button type="button" className="btn btn--sm" onClick={() => onZoom(-10)} title="ズームアウト (-)">
      −
    </button>
    <button type="button" className="btn btn--sm" onClick={() => onSetLoop("A")} title="ループ A">
      A
    </button>
    <button type="button" className="btn btn--sm" onClick={() => onSetLoop("B")} title="ループ B">
      B
    </button>
    <button type="button" className="btn btn--sm" onClick={onClearLoop} title="ループ解除">
      ⟲✕
    </button>
    {state.loopA != null && state.loopB != null && (
      <span className="transport__loop">
        Loop {formatTime(state.loopA)}–{formatTime(state.loopB)}
      </span>
    )}
    <div className="transport__audio">
      <button
        type="button"
        className={`btn btn--icon ${state.audioEnabled ? "" : "btn--mute-active"}`}
        onClick={onToggleAudio}
        title="マスター音声モニター"
      >
        {state.audioEnabled ? "🔊" : "🔇"}
      </button>
      <input
        type="range"
        className="transport__vol"
        min={0}
        max={2}
        step={0.05}
        value={state.masterVolume}
        onChange={(e) => onMasterVolume(Number(e.target.value))}
        title="マスター音量"
      />
    </div>
  </div>
);
