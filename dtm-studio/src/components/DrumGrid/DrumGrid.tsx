import { useMemo } from "react";
import type { Track } from "../../types/project";

type Props = {
  tracks: Track[];
  selectedTrackId: string | null;
  loopStart: number;
  loopEnd: number;
  playheadBeat: number;
  playing: boolean;
  onSelectTrack: (id: string) => void;
  onToggleStep: (trackId: string, beat: number) => void;
  onPreview: (trackId: string) => void;
};

export const DRUM_STEP = 0.25;

export const isDrumStepHit = (start: number, beat: number) =>
  Math.abs(start - beat) < DRUM_STEP * 0.49;

const STEP = DRUM_STEP;
const nearestStep = isDrumStepHit;

export function DrumGrid({
  tracks,
  selectedTrackId,
  loopStart,
  loopEnd,
  playheadBeat,
  playing,
  onSelectTrack,
  onToggleStep,
  onPreview,
}: Props) {
  const start = Math.max(0, Math.floor(loopStart / STEP) * STEP);
  const end = Math.max(start + 4, loopEnd);
  const steps = useMemo(() => {
    const out: number[] = [];
    for (let b = start; b < end - 1e-6; b += STEP) out.push(Number(b.toFixed(4)));
    return out;
  }, [start, end]);

  const bars = Math.max(1, Math.round((end - start) / 4));

  return (
    <div className="drum-grid">
      <p className="drum-grid__hint">
        行が楽器、列が16分。マスをクリックしてキックとスネアなどを同じ枠で重ねます。
      </p>
      <div className="drum-grid__scroll">
        <div className="drum-grid__table" style={{ gridTemplateColumns: `108px repeat(${steps.length}, minmax(18px, 1fr))` }}>
          <div className="drum-grid__corner" />
          {steps.map((b) => {
            const i = Math.round((b - start) / STEP);
            const bar = i % 16 === 0;
            const beat = i % 4 === 0;
            return (
              <div
                key={b}
                className={`drum-grid__col${bar ? " is-bar" : ""}${beat ? " is-beat" : ""}`}
              >
                {bar ? `${Math.floor(b / 4) + 1}` : ""}
              </div>
            );
          })}
          {tracks.map((t) => (
            <DrumRow
              key={t.id}
              track={t}
              steps={steps}
              selected={t.id === selectedTrackId}
              playheadBeat={playing ? playheadBeat : -1}
              onSelect={() => onSelectTrack(t.id)}
              onPreview={() => onPreview(t.id)}
              onToggle={(beat) => onToggleStep(t.id, beat)}
            />
          ))}
        </div>
      </div>
      <p className="drum-grid__meta">{bars} 小節 · {tracks.length} 楽器</p>
    </div>
  );
}

function DrumRow({
  track,
  steps,
  selected,
  playheadBeat,
  onSelect,
  onPreview,
  onToggle,
}: {
  track: Track;
  steps: number[];
  selected: boolean;
  playheadBeat: number;
  onSelect: () => void;
  onPreview: () => void;
  onToggle: (beat: number) => void;
}) {
  return (
    <>
      <button
        type="button"
        className={`drum-grid__label${selected ? " is-on" : ""}`}
        style={{ borderLeftColor: track.color }}
        onClick={onSelect}
        onDoubleClick={onPreview}
        title="ダブルクリックで試聴"
      >
        <span className="drum-grid__swatch" style={{ background: track.color }} />
        {track.name}
      </button>
      {steps.map((b) => {
        const on = track.notes.some((n) => nearestStep(n.start, b));
        const now = playheadBeat >= b && playheadBeat < b + STEP;
        return (
          <button
            key={`${track.id}-${b}`}
            type="button"
            className={`drum-grid__cell${on ? " is-hit" : ""}${now ? " is-now" : ""}`}
            style={on ? { background: track.color } : undefined}
            onClick={() => onToggle(b)}
            aria-label={`${track.name} ${b}`}
          />
        );
      })}
    </>
  );
}
