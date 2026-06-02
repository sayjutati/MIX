import type { EditorState } from "../types";
import { getWorkflowStep, workflowMessages } from "../utils/workflow";
import { formatTime } from "../utils/time";

interface Props {
  state: EditorState;
  mode: "beginner" | "pro";
}

export const StatusBar = ({ state, mode }: Props) => {
  const step = getWorkflowStep(state);
  const hint = workflowMessages[step].title;
  const clipName = state.selectedClipId
    ? state.assets.find(
        (a) =>
          a.id ===
          (state.clips.find((c) => c.id === state.selectedClipId)?.assetId ??
            state.textClips.find((c) => c.id === state.selectedClipId)?.assetId)
      )?.name ?? "テキスト"
    : null;

  return (
    <footer className="status-bar">
      <span className="status-bar__item">
        {state.isPlaying ? "▶ 再生中" : "⏸ 停止"}
      </span>
      <span className="status-bar__item status-bar__time">
        {formatTime(state.playhead)} / {formatTime(state.duration)}
      </span>
      {clipName && (
        <span className="status-bar__item">
          選択: <strong>{clipName}</strong>
        </span>
      )}
      <span className="status-bar__item status-bar__hint">{hint}</span>
      <span className="status-bar__item status-bar__mode">
        {mode === "beginner" ? "かんたんモード" : "詳細モード"}
      </span>
    </footer>
  );
};
