import { TRACK_HEADER_WIDTH } from "../types";
import { formatRulerTime, formatTime } from "../utils/time";

interface Props {
  duration: number;
  contentDuration: number;
  pxPerSec: number;
  playhead: number;
  loopA: number | null;
  loopB: number | null;
  onSeek: (t: number) => void;
}

export const TimelineRuler = ({
  duration,
  contentDuration,
  pxPerSec,
  playhead,
  loopA,
  loopB,
  onSeek,
}: Props) => {
  const laneWidth = duration * pxPerSec;
  const majorStep =
    pxPerSec >= 140 ? 0.5 : pxPerSec >= 60 ? 1 : pxPerSec >= 28 ? 2 : pxPerSec >= 14 ? 5 : 10;
  const subDivisions = majorStep >= 2 ? 4 : 2;
  const minorStep = majorStep / subDivisions;

  const majorTicks: number[] = [];
  for (let t = 0; t <= duration + 1e-4; t += majorStep) {
    majorTicks.push(Number(t.toFixed(3)));
  }

  const minorTicks: number[] = [];
  if (pxPerSec * minorStep >= 10) {
    for (let t = 0; t <= duration + 1e-4; t += minorStep) {
      const r = Number(t.toFixed(3));
      if (Math.abs(r % majorStep) > 1e-3 && Math.abs((r % majorStep) - majorStep) > 1e-3) {
        minorTicks.push(r);
      }
    }
  }

  const seekFromClientX = (el: HTMLElement, clientX: number) => {
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, clientX - rect.left);
    onSeek(x / pxPerSec);
  };

  const hasLoop = loopA != null && loopB != null && loopB > loopA;

  return (
    <div className="timeline-ruler-row" style={{ width: TRACK_HEADER_WIDTH + laneWidth }}>
      <div className="timeline-ruler__corner">
        <span>タイムコード</span>
      </div>
      <div
        className="timeline-ruler"
        style={{ width: laneWidth }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          const el = e.currentTarget;
          el.setPointerCapture(e.pointerId);
          seekFromClientX(el, e.clientX);
          const onMove = (ev: PointerEvent) => seekFromClientX(el, ev.clientX);
          const onUp = () => {
            el.removeEventListener("pointermove", onMove);
            el.removeEventListener("pointerup", onUp);
            el.removeEventListener("pointercancel", onUp);
          };
          el.addEventListener("pointermove", onMove);
          el.addEventListener("pointerup", onUp);
          el.addEventListener("pointercancel", onUp);
        }}
      >
        {/* 実コンテンツ終端マーカー（ここまで書き出される位置が一目でわかる） */}
        <div
          className="timeline-ruler__export-end"
          style={{ left: contentDuration * pxPerSec }}
          title={`書き出し終端: ${formatTime(contentDuration)}`}
        />

        {hasLoop && (
          <div
            className="timeline-ruler__loop"
            style={{
              left: loopA! * pxPerSec,
              width: (loopB! - loopA!) * pxPerSec,
            }}
          />
        )}

        {minorTicks.map((t) => (
          <div
            key={`m-${t}`}
            className="timeline-ruler__minor"
            style={{ left: t * pxPerSec }}
          />
        ))}

        {majorTicks.map((t) => (
          <div
            key={t}
            className="timeline-ruler__tick"
            style={{ left: t * pxPerSec }}
          >
            <span>{formatRulerTime(t)}</span>
          </div>
        ))}

        <div
          className="timeline-ruler__playhead-cap"
          style={{ left: playhead * pxPerSec }}
        />
      </div>
    </div>
  );
};
