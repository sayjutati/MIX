import {
  KEYBOARD_W,
  PITCH_COUNT,
  PITCH_MAX,
  PITCH_MIN,
  ROW_H,
  isBlackKey,
} from "./pianoRollConstants";
import { drumKeyboardLabel } from "../../audio/drumMap";
import { pitchJaKeyboardLabel, pitchJaName } from "../../utils/pitchLabel";

type Props = {
  activePitches: Set<number>;
  drumMode?: boolean;
  onKeyDown: (pitch: number) => void;
  onKeyUp: (pitch: number) => void;
  height: number;
};

export function PianoKeyboard({
  activePitches,
  drumMode = false,
  onKeyDown,
  onKeyUp,
  height,
}: Props) {
  return (
    <div className="piano-keyboard" style={{ width: KEYBOARD_W, height }}>
      {Array.from({ length: PITCH_COUNT }, (_, i) => {
        const pitch = PITCH_MAX - i;
        const black = isBlackKey(pitch);
        const active = activePitches.has(pitch);
        const drumLabel = drumMode ? drumKeyboardLabel(pitch) : null;
        const label = drumLabel ?? pitchJaKeyboardLabel(pitch, black);
        const ariaLabel = drumLabel ? `${drumLabel} (${pitch})` : pitchJaName(pitch);
        return (
          <button
            key={pitch}
            type="button"
            className={`piano-key${black ? " piano-key--black" : ""}${active ? " is-active" : ""}${
              drumLabel ? " piano-key--drum" : ""
            }`}
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
            aria-label={ariaLabel}
          >
            {label ? (
              <span
                className={`piano-key__label${black ? " piano-key__label--black" : ""}${
                  drumLabel ? " piano-key__label--drum" : pitch % 12 === 0 ? " piano-key__label--octave" : ""
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
