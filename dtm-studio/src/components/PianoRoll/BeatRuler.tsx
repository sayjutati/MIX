import type { RefObject } from "react";
import { snapBeat } from "../../utils/quantize";

type Props = {
  rulerRef: RefObject<HTMLDivElement | null>;
  beatsVisible: number;
  beatWidth: number;
  loopStart: number;
  loopEnd: number;
  loopEnabled: boolean;
  playheadBeat: number;
  playing: boolean;
  quantizeGrid: number;
  onScroll: (left: number) => void;
  onLoopChange: (start: number, end: number) => void;
  onSeekBeat: (beat: number) => void;
};

export function BeatRuler({
  rulerRef,
  beatsVisible,
  beatWidth,
  loopStart,
  loopEnd,
  loopEnabled,
  playheadBeat,
  playing,
  quantizeGrid,
  onScroll,
  onLoopChange,
  onSeekBeat,
}: Props) {
  const width = beatsVisible * beatWidth;
  const grid = Math.max(quantizeGrid, 0.125);

  const onDrag =
    (which: "start" | "end") => (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const bar = e.currentTarget.parentElement!;
      const move = (ev: PointerEvent) => {
        // 内側要素の rect はスクロールと一緒に動くので scrollLeft を足さない
        const x = ev.clientX - bar.getBoundingClientRect().left;
        const beat = Math.max(0, Math.round((x / beatWidth) / grid) * grid);
        if (which === "start") {
          onLoopChange(beat, Math.max(beat + grid, loopEnd));
        } else {
          onLoopChange(loopStart, Math.max(loopStart + grid, beat));
        }
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };

  const onRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest(".beat-ruler__handle")) return;
    if (e.button !== 0) return;
    e.preventDefault();
    const bar = e.currentTarget;
    const seekAt = (clientX: number) => {
      const x = clientX - bar.getBoundingClientRect().left;
      onSeekBeat(Math.max(0, snapBeat(x / beatWidth, grid)));
    };
    seekAt(e.clientX);
    const move = (ev: PointerEvent) => seekAt(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      className="beat-ruler-wrap"
      ref={rulerRef}
      onScroll={(e) => onScroll(e.currentTarget.scrollLeft)}
    >
      <div className="beat-ruler" style={{ width }} onPointerDown={onRulerPointerDown}>
        {Array.from({ length: Math.ceil(beatsVisible / 4) + 1 }, (_, i) => (
          <span key={i} className="beat-ruler__bar" style={{ left: i * 4 * beatWidth + 4 }}>
            {i + 1}小節
          </span>
        ))}
        {loopEnabled && (
          <div
            className="beat-ruler__loop"
            style={{ left: loopStart * beatWidth, width: (loopEnd - loopStart) * beatWidth }}
          />
        )}
        <div
          className="beat-ruler__handle beat-ruler__handle--start tooltip"
          data-tooltip="ループ開始（ドラッグ）"
          style={{ left: loopStart * beatWidth - 4 }}
          onPointerDown={onDrag("start")}
        />
        <div
          className="beat-ruler__handle beat-ruler__handle--end tooltip"
          data-tooltip="ループ終了（ドラッグ）"
          style={{ left: loopEnd * beatWidth - 4 }}
          onPointerDown={onDrag("end")}
        />
        <div
          className={`beat-ruler__playhead${playing ? " beat-ruler__playhead--playing" : ""}`}
          style={{ left: playheadBeat * beatWidth }}
        />
      </div>
    </div>
  );
}
