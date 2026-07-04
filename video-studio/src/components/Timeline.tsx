import { useRef } from "react";
import type { EditorApi } from "../hooks/useEditor";
import type { EditorState } from "../types";
import { timelineX, timeFromTimelineX } from "../types";
import { TimelineRuler } from "./TimelineRuler";
import { TrackRow } from "./TrackRow";

interface Props {
  state: EditorState;
  editor: EditorApi;
  onPlacementFailed?: (reason: string) => void;
}

export const Timeline = ({ state, editor, onPlacementFailed }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const dropAsset = (e: React.DragEvent) => {
    e.preventDefault();
    const assetId = e.dataTransfer.getData("application/x-mix-asset");
    if (!assetId) return;
    const scroll = scrollRef.current;
    if (!scroll) return;
    const rect = scroll.getBoundingClientRect();
    const x = e.clientX - rect.left + scroll.scrollLeft;
    const at = timeFromTimelineX(x, state.pxPerSec);
    const result = editor.addClipFromAsset(assetId, undefined, at);
    if (!result.ok && result.reason) onPlacementFailed?.(result.reason);
  };

  return (
    <section className="timeline">
      <div className="timeline__head">
        <h2 className="timeline__title">タイムライン</h2>
        <label className="timeline__snap">
          <input
            type="checkbox"
            checked={state.snapEnabled}
            onChange={(e) => editor.patch({ snapEnabled: e.target.checked })}
          />
          グリッドにスナップ
        </label>
        <span className="timeline__hint">素材をここへドラッグして配置</span>
      </div>
      <div
        className="timeline__scroll"
        ref={scrollRef}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={dropAsset}
      >
        <TimelineRuler
          duration={state.duration}
          pxPerSec={state.pxPerSec}
          playhead={state.playhead}
          onSeek={(t) => editor.patch({ playhead: t })}
        />
        {state.tracks.map((track) => (
          <TrackRow key={track.id} track={track} state={state} editor={editor} />
        ))}
        <div
          className="timeline__playhead-line"
          style={{ left: timelineX(state.playhead, state.pxPerSec) }}
          onMouseDown={(e) => {
            const scroll = scrollRef.current;
            if (!scroll) return;
            const onMove = (ev: MouseEvent) => {
              const rect = scroll.getBoundingClientRect();
              const x = ev.clientX - rect.left + scroll.scrollLeft;
              editor.patch({ playhead: timeFromTimelineX(x, state.pxPerSec) });
            };
            const onUp = () => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
            e.preventDefault();
          }}
        />
      </div>
    </section>
  );
};
