import { beatToSec } from "../types/project";

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

/** 秒 → 小節.拍.補助（BPM基準、4/4想定） */
export const formatBarsBeats = (seconds: number, bpm: number, beatsPerBar = 4) => {
  const beatLen = 60 / bpm;
  const totalBeats = Math.max(0, seconds / beatLen);
  const bar = Math.floor(totalBeats / beatsPerBar) + 1;
  const beatInBar = Math.floor(totalBeats % beatsPerBar) + 1;
  const sub = Math.floor(((totalBeats % 1) + 1e-9) * 4) % 4 + 1;
  return `${bar}.${beatInBar}.${sub}`;
};

/** 拍位置 → 表示用秒 */
export const beatToDisplaySec = (beat: number, tempo: number) => beatToSec(Math.max(0, beat), tempo);

/** 拍位置 → 小節.拍.補助 */
export const formatBeatPosition = (beat: number, tempo: number, beatsPerBar = 4) =>
  formatBarsBeats(beatToDisplaySec(beat, tempo), tempo, beatsPerBar);

/** 秒入力 → 拍 */
export const secToBeat = (sec: number, tempo: number) => (sec * tempo) / 60;

/** 小節.拍.補助 文字列 → 拍（4/4想定）例: 3.2.1 */
export const parseBeatPosition = (text: string, beatsPerBar = 4): number | null => {
  const parts = text.trim().split(".").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 1) return Math.max(0, (parts[0]! - 1) * beatsPerBar);
  if (parts.length === 2) {
    return Math.max(0, (parts[0]! - 1) * beatsPerBar + (parts[1]! - 1));
  }
  const [bar, beat, sub = 1] = parts;
  return Math.max(0, (bar! - 1) * beatsPerBar + (beat! - 1) + (sub! - 1) * 0.25);
};
