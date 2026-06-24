import {
  KEYBOARD_W,
  PITCH_COUNT,
  PITCH_MAX,
  PITCH_MIN,
  ROW_H,
  isBlackKey,
} from "./pianoRollConstants";
import { pitchJaKeyboardLabel, pitchJaName } from "../../utils/pitchLabel";

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
        const label = pitchJaKeyboardLabel(pitch, black);
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
            aria-label={pitchJaName(pitch)}
          >
            {label ? (
              <span
                className={`piano-key__label${black ? " piano-key__label--black" : ""}${
                  pitch % 12 === 0 ? " piano-key__label--octave" : ""
                }`}
              >
                {label}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export { PITCH_MIN, PITCH_MAX };
