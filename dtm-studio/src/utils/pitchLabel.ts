/** 日本の固定ド音階（ドレミファソラシ） */
const SOLFEGE = [
  "ド",
  "ド#",
  "レ",
  "レ#",
  "ミ",
  "ファ",
  "ファ#",
  "ソ",
  "ソ#",
  "ラ",
  "ラ#",
  "シ",
] as const;

export const pitchOctave = (pitch: number) => Math.floor(pitch / 12) - 1;

/** ドレミ表記（例: ド#4, ラ3） */
export const pitchJaName = (pitch: number) =>
  `${SOLFEGE[pitch % 12]}${pitchOctave(pitch)}`;

/** 鍵盤表示用：白鍵は音名、ドの行だけオクターブ付き */
export const pitchJaKeyboardLabel = (pitch: number, black: boolean) => {
  const name = SOLFEGE[pitch % 12];
  if (black) return name.includes("#") ? name : "";
  if (pitch % 12 === 0) return `${name}${pitchOctave(pitch)}`;
  return name;
};

export const pitchJaRangeLabel = (min: number, max: number) =>
  `${pitchJaName(min)} – ${pitchJaName(max)}`;

/** 従来の英語表記（MIDI 書き出し等） */
export const pitchEnName = (pitch: number) => {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[pitch % 12]}${pitchOctave(pitch)}`;
};
