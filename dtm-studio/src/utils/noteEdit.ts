import type { MidiNote } from "../types/project";
import { makeNote } from "../types/project";
import { PITCH_MAX, PITCH_MIN } from "../components/PianoRoll/pianoRollConstants";

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
