export const ROW_H = 18;
export const BEAT_W = 52;
export const PITCH_MIN = 36;
export const PITCH_MAX = 84;
export const PITCH_COUNT = PITCH_MAX - PITCH_MIN + 1;
export const RESIZE_HANDLE = 8;
export const MIN_DURATION = 0.125;
export const KEYBOARD_W = 56;

export const isBlackKey = (pitch: number) => [1, 3, 6, 8, 10].includes(pitch % 12);

export const pitchLabel = (pitch: number) => {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const n = names[pitch % 12];
  const oct = Math.floor(pitch / 12) - 1;
  return `${n}${oct}`;
};
