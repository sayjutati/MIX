import { useRef } from "react";
import type { EditorApi } from "../hooks/useEditor";
import type { EditorState } from "../types";
import { timelineX, timeFromTimelineX } from "../types";
import { TimelineRuler } from "./TimelineRuler";
import { TrackRow } from "./TrackRow";

interface Props {
  state: EditorState;
  editor: EditorApi;
}

export const Timeline = ({ state, editor }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);

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
      </div>
      <div className="timeline__scroll" ref={scrollRef}>
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
