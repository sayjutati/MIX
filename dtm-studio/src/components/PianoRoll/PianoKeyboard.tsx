import {
  KEYBOARD_W,
  PITCH_COUNT,
  PITCH_MAX,
  PITCH_MIN,
  ROW_H,
  isBlackKey,
} from "./pianoRollConstants";

type Props = {
  activePitches: Set<number>;
  onKeyDown: (pitch: number) => void;
  onKeyUp: (pitch: number) => void;
  height: number;
};

export function PianoKeyboard({ activePitches, onKeyDown, onKeyUp, height }: Props) {
  return (
    <div className="piano-keyboard" style={{ width: KEYBOARD_W, height }}>
      {Array.from({ length: PITCH_COUNT }, (_, i) => {
        const pitch = PITCH_MAX - i;
        const black = isBlackKey(pitch);
        const active = activePitches.has(pitch);
        return (
          <button
            key={pitch}
            type="button"
            className={`piano-key${black ? " piano-key--black" : ""}${active ? " is-active" : ""}`}
            style={{ height: ROW_H }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              onKeyDown(pitch);
            }}
            onPointerUp={(e) => {
              onKeyUp(pitch);
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
            }}
            aria-label={pitchLabelShort(pitch)}
          />
        );
      })}
    </div>
  );
}

const pitchLabelShort = (pitch: number) => {
  const names = ["ド", "ド#", "レ", "レ#", "ミ", "ファ", "ファ#", "ソ", "ソ#", "ラ", "ラ#", "シ"];
  return `${names[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
};

export { PITCH_MIN, PITCH_MAX };
