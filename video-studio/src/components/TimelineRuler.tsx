import { timeFromTimelineX, timelineX, TRACK_HEADER_WIDTH } from "../types";
import { formatTime } from "../utils/time";

interface Props {
  duration: number;
  pxPerSec: number;
  playhead: number;
  onSeek: (t: number) => void;
}

export const TimelineRuler = ({ duration, pxPerSec, playhead, onSeek }: Props) => {
  const width = timelineX(duration, pxPerSec);
  const ticks: number[] = [];
  const step = pxPerSec >= 60 ? 1 : pxPerSec >= 30 ? 2 : 5;
  for (let t = 0; t <= duration + step; t += step) ticks.push(t);

  return (
    <div
      className="timeline-ruler"
      style={{ width }}
      onClick={(e) => {
        const scroll = e.currentTarget.parentElement;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left + (scroll?.scrollLeft ?? 0);
        onSeek(timeFromTimelineX(x, pxPerSec));
      }}
    >
      {ticks.map((t) => (
        <div
          key={t}
          className="timeline-ruler__tick"
          style={{ left: timelineX(t, pxPerSec) - TRACK_HEADER_WIDTH }}
        >
          <span>{formatTime(t)}</span>
        </div>
      ))}
      <div
        className="timeline-ruler__playhead"
        style={{ left: timelineX(playhead, pxPerSec) - TRACK_HEADER_WIDTH }}
      />
    </div>
  );
};
