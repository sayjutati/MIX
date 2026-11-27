import type { EditorState } from "../types";
import { DEFAULT_FPS, projectDuration } from "../types";
import { formatTime } from "../utils/time";

interface Props {
  state: EditorState;
  statusMsg?: string;
}

export const StatusBar = ({ state, statusMsg }: Props) => {
  const contentEnd = projectDuration(state.clips, state.textClips);
  const selectedText = state.textClips.find((c) => c.id === state.selectedClipId);
  const selectedMedia = state.clips.find((c) => c.id === state.selectedClipId);
  const selectedLabel = selectedText
    ? `テロップ「${selectedText.text.slice(0, 18)}」`
    : selectedMedia
      ? state.assets.find((a) => a.id === selectedMedia.assetId)?.name ?? "クリップ"
      : null;

  return (
    <footer className="status-bar">
      <span className="status-bar__item">
        {state.isPlaying ? "▶ 再生中" : "⏸ 停止"}
      </span>
      <span className="status-bar__item status-bar__time">
        {formatTime(state.playhead, state.fps ?? DEFAULT_FPS)} /{" "}
        {formatTime(contentEnd, state.fps ?? DEFAULT_FPS)}
      </span>
      <span className="status-bar__item">
        {state.previewWidth}×{state.previewHeight} · {state.fps ?? DEFAULT_FPS}fps
      </span>
      {selectedLabel && (
        <span className="status-bar__item">
          選択中: <strong>{selectedLabel}</strong>
        </span>
      )}
      <span className="status-bar__item status-bar__hint">
        {statusMsg || "Space: 再生 · S: 分割 · [/]: トリム · Shift+Del: 詰めて削除 · Ctrl+ホイール: 拡縮"}
      </span>
    </footer>
  );
};
