export const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  const ms = Math.floor((seconds % 1) * 10).toString();
  return `${m}:${s}.${ms}`;
};

/** 秒 → 小節:拍.補助（BPM基準、4/4想定） */
export const formatBarsBeats = (seconds: number, bpm: number, beatsPerBar = 4) => {
  const beatLen = 60 / bpm;
  const totalBeats = Math.max(0, seconds / beatLen);
  const bar = Math.floor(totalBeats / beatsPerBar) + 1;
  const beatInBar = Math.floor(totalBeats % beatsPerBar) + 1;
  const sub = Math.floor(((totalBeats % 1) + 1e-9) * 4) % 4 + 1;
  return `${bar}.${beatInBar}.${sub}`;
};
