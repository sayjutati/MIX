import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { EditorApi } from "../hooks/useEditor";
import type { EditorState } from "../types";
import { DEFAULT_FPS, projectDuration } from "../types";
import { formatTime } from "../utils/time";

interface Props {
  state: EditorState;
  editor: EditorApi;
  onPlayToggle: () => void;
  onSeek: (time: number) => void;
}

export const TransportBar = ({ state, editor, onPlayToggle, onSeek }: Props) => {
  const contentEnd = projectDuration(state.clips, state.textClips);
  const fps = state.fps ?? DEFAULT_FPS;
  const frameStep = 1 / fps;
  const hasLoop = state.loopA != null && state.loopB != null && state.loopB > state.loopA;

  return (
    <div className="transport">
      <div className="transport__scrub-row">
        <input
          type="range"
          className="transport__scrub"
          min={0}
          max={Math.max(contentEnd, 0.1)}
          step={0.01}
          value={Math.min(state.playhead, contentEnd)}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="シークバー"
        />
      </div>

      <div className="transport__controls-row">
        <div className="transport__time" title="現在時刻 / 書き出し総尺 (分:秒:フレーム)">
          <span className="transport__time-now">{formatTime(state.playhead, fps)}</span>
          <span className="transport__time-sep">/</span>
          <span className="transport__time-end">{formatTime(contentEnd, fps)}</span>
        </div>

        <div className="transport__buttons">
          <button
            type="button"
            className="transport__btn"
            onClick={() => onSeek(0)}
            title="先頭へ (Home)"
          >
            <SkipBack size={14} />
          </button>
          <button
            type="button"
            className="transport__btn"
            onClick={() => onSeek(Math.max(0, state.playhead - frameStep))}
            title="1フレーム戻る (←)"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="transport__btn transport__btn--play"
            onClick={onPlayToggle}
            title="再生 / 一時停止 (Space / K)"
          >
            {state.isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            type="button"
            className="transport__btn"
            onClick={() => onSeek(Math.min(contentEnd, state.playhead + frameStep))}
            title="1フレーム進む (→)"
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            className="transport__btn"
            onClick={() => onSeek(contentEnd)}
            title="作品の末尾へ (End)"
          >
            <SkipForward size={14} />
          </button>
        </div>

        <div className="transport__right">
          <div className="transport__loop">
            <button
              type="button"
              className={`transport__mini-btn ${state.loopA != null ? "transport__mini-btn--active" : ""}`}
              onClick={() => editor.patch({ loopA: state.playhead })}
              title="ループ開始点 (IN) を現在位置に設定"
            >
              IN
            </button>
            <button
              type="button"
              className={`transport__mini-btn ${state.loopB != null ? "transport__mini-btn--active" : ""}`}
              onClick={() => editor.patch({ loopB: state.playhead })}
              title="ループ終了点 (OUT) を現在位置に設定"
            >
              OUT
            </button>
            {hasLoop && (
              <button
                type="button"
                className="transport__mini-btn transport__mini-btn--loop"
                onClick={() => editor.patch({ loopA: null, loopB: null })}
                title="ループ解除"
              >
                <Repeat size={11} />
              </button>
            )}
          </div>

          <div className="transport__vol">
            <button
              type="button"
              className="transport__btn"
              onClick={() => editor.patch({ audioEnabled: !state.audioEnabled })}
              title={!state.audioEnabled ? "マスターミュート解除" : "マスターミュート"}
            >
              {!state.audioEnabled ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              min={0}
              max={1.2}
              step={0.02}
              value={!state.audioEnabled ? 0 : state.masterVolume}
              onChange={(e) =>
                editor.patch({ masterVolume: Number(e.target.value), audioEnabled: true })
              }
              aria-label="マスター音量"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
