import { BEAT_W } from "./PianoRollCanvas";

type Props = {
  loopStart: number;
  loopEnd: number;
  beatsVisible: number;
  quantizeGrid: number;
  onLoopChange: (start: number, end: number) => void;
};

export function LoopRuler({
  loopStart,
  loopEnd,
  beatsVisible,
  quantizeGrid,
  onLoopChange,
}: Props) {
  const width = beatsVisible * BEAT_W;
  const grid = Math.max(quantizeGrid, 0.125);

  const onDrag =
    (which: "start" | "end") => (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const bar = e.currentTarget.parentElement!;
      const rect = bar.getBoundingClientRect();
      const move = (ev: PointerEvent) => {
        const x = ev.clientX - rect.left + (bar.parentElement?.scrollLeft ?? 0);
        const beat = Math.max(0, Math.round((x / BEAT_W) / grid) * grid);
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

  return (
    <div className="loop-ruler" style={{ width }}>
      <div
        className="loop-ruler__region"
        style={{ left: loopStart * BEAT_W, width: (loopEnd - loopStart) * BEAT_W }}
      />
      <div
        className="loop-ruler__handle loop-ruler__handle--start"
        style={{ left: loopStart * BEAT_W - 4 }}
        onPointerDown={onDrag("start")}
        title="ループ開始"
      />
      <div
        className="loop-ruler__handle loop-ruler__handle--end"
        style={{ left: loopEnd * BEAT_W - 4 }}
        onPointerDown={onDrag("end")}
        title="ループ終了"
      />
      <span className="loop-ruler__label">
        Loop {loopStart} – {loopEnd}
      </span>
    </div>
  );
}
