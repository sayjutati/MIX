import { Pause, Play, Repeat, SkipBack, Square, Volume2, VolumeX } from "lucide-react";
import type { EditorState } from "../types";
import { formatTime } from "../utils/time";

interface Props {
  state: EditorState;
  onPlay: () => void;
  onStop: () => void;
  onSeek: (t: number) => void;
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
  onSetLoop,
  onClearLoop,
  onMasterVolume,
  onToggleAudio,
}: Props) => (
  <div className="transport">
    <div className="transport__main">
      <button
        type="button"
        className="transport__btn transport__btn--play"
        onClick={onPlay}
        title="再生 / 一時停止 (Space)"
      >
        {state.isPlaying ? <Pause size={20} /> : <Play size={20} />}
      </button>
      <button
        type="button"
        className="transport__btn"
        onClick={() => onSeek(0)}
        title="先頭へ"
      >
        <SkipBack size={18} />
      </button>
      <button type="button" className="transport__btn" onClick={onStop} title="停止">
        <Square size={16} />
      </button>
      <div className="transport__time">
        <span className="transport__time-current">{formatTime(state.playhead)}</span>
        <span className="transport__time-sep">/</span>
        <span className="transport__time-total">{formatTime(state.duration)}</span>
      </div>
      <input
        type="range"
        className="transport__scrub"
        min={0}
        max={state.duration}
        step={0.01}
        value={state.playhead}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="再生位置"
      />
    </div>

    <div className="transport__loop">
      <button type="button" className="btn btn--xs" onClick={() => onSetLoop("A")} title="ループ開始">
        A
      </button>
      <button type="button" className="btn btn--xs" onClick={() => onSetLoop("B")} title="ループ終了">
        B
      </button>
      <button type="button" className="btn btn--xs btn--ghost" onClick={onClearLoop} title="ループ解除">
        <Repeat size={12} />
      </button>
      {state.loopA != null && state.loopB != null && (
        <span className="transport__loop-label">
          {formatTime(state.loopA)} – {formatTime(state.loopB)}
        </span>
      )}
    </div>

    <div className="transport__master">
      <button
        type="button"
        className={`transport__btn ${!state.audioEnabled ? "transport__btn--off" : ""}`}
        onClick={onToggleAudio}
        title="マスター音声"
      >
        {state.audioEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>
      <input
        type="range"
        className="transport__vol"
        min={0}
        max={2}
        step={0.05}
        value={state.masterVolume}
        onChange={(e) => onMasterVolume(Number(e.target.value))}
        aria-label="マスター音量"
      />
      <span className="transport__vol-val">{Math.round(state.masterVolume * 100)}%</span>
    </div>
  </div>
);
