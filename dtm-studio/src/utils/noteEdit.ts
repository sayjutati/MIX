import type { MidiNote } from "../types/project";
import { makeNote } from "../types/project";
import { MIN_DURATION, PITCH_MAX, PITCH_MIN } from "../components/PianoRoll/pianoRollConstants";

export const cloneNotesForClipboard = (notes: MidiNote[]): MidiNote[] =>
  notes.map((n) => ({ ...n }));

export const pasteNotesAt = (
  clipboard: MidiNote[],
  atBeat: number,
  offsetBeats = 0
): Omit<MidiNote, "id">[] => {
  if (clipboard.length === 0) return [];
  const minStart = Math.min(...clipboard.map((n) => n.start));
  const base = atBeat + offsetBeats - minStart;
  return clipboard.map((n) => ({
    pitch: n.pitch,
    start: Math.max(0, n.start + base),
    duration: n.duration,
    velocity: n.velocity,
  }));
};

export const duplicateNotesInPlace = (
  notes: MidiNote[],
  offsetBeats: number
): Omit<MidiNote, "id">[] =>
  notes.map((n) => ({
    pitch: n.pitch,
    start: Math.max(0, n.start + offsetBeats),
    duration: n.duration,
    velocity: n.velocity,
  }));

export const transposeNotePatch = (pitch: number, semitones: number) => ({
  pitch: Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + semitones)),
});

export const nudgeNotePatch = (
  note: MidiNote,
  dBeat: number,
  dPitch: number
): Partial<MidiNote> => ({
  start: Math.max(0, note.start + dBeat),
  pitch: Math.max(PITCH_MIN, Math.min(PITCH_MAX, note.pitch + dPitch)),
});

export const newNoteFromPartial = (partial: Omit<MidiNote, "id">) => makeNote(partial);

/** 選択ノートの開始位置と長さをアンカー基準で伸縮 */
export const scaleNotesTiming = (
  notes: MidiNote[],
  anchorBeat: number,
  factor: number,
  minDuration = MIN_DURATION
): Array<{ noteId: string; patch: Partial<MidiNote> }> => {
  const f = Math.max(0.1, Math.min(8, factor));
  return notes.map((n) => ({
    noteId: n.id,
    patch: {
      start: Math.max(0, anchorBeat + (n.start - anchorBeat) * f),
      duration: Math.max(minDuration, n.duration * f),
    },
  }));
};

/** 2 拍の間をグリッド刻みしたセル開始位置 */
export const paintBeatsBetween = (a: number, b: number, grid: number): number[] => {
  const step = Math.max(0.0625, grid);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const start = Math.max(0, Math.floor(lo / step + 1e-9) * step);
  const out: number[] = [];
  for (let t = start; t <= hi + 1e-9; t += step) {
    out.push(Math.round(t / step) * step);
  }
  return out;
};
