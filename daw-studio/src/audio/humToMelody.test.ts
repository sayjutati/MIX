import { describe, expect, it } from "vitest";
import { MELODY_VOICES } from "../types";
import {
  inferKey,
  melodyVoiceSpec,
  quantizeMelodyNotes,
  snapMelodyToKey,
  snapSecToGrid,
} from "./humToMelody";
import type { PitchNote } from "../types";

const note = (midi: number, start: number, end: number, id = midi): PitchNote => ({
  id,
  midi,
  start,
  end,
  shift: 0,
});

describe("snapSecToGrid", () => {
  it("snaps to 16th notes at 120 BPM", () => {
    // 120 BPM → 1 beat = 0.5s, 16th = 0.125s
    expect(snapSecToGrid(0.13, 120, 0.25)).toBeCloseTo(0.125);
    expect(snapSecToGrid(0, 120, 0.25)).toBe(0);
  });
  it("leaves time alone when grid is 0", () => {
    expect(snapSecToGrid(1.23, 120, 0)).toBeCloseTo(1.23);
  });
});

describe("quantizeMelodyNotes", () => {
  it("drops notes shorter than a grid step after snapping", () => {
    const out = quantizeMelodyNotes([note(60, 0, 0.02)], 120, 0.25);
    expect(out).toHaveLength(0);
  });
  it("keeps a quarter-ish hummed note and rounds midi", () => {
    const out = quantizeMelodyNotes([note(60.4, 0.02, 0.52)], 120, 0.25);
    expect(out).toHaveLength(1);
    expect(out[0]!.midi).toBe(60);
    expect(out[0]!.start).toBeCloseTo(0);
    expect(out[0]!.end).toBeGreaterThan(out[0]!.start);
  });
});

describe("inferKey + snapMelodyToKey", () => {
  it("guesses C major for a C-major hummed line", () => {
    const notes = [note(60, 0, 0.5), note(64, 0.5, 1), note(67, 1, 1.5), note(72, 1.5, 2)];
    const key = inferKey(notes);
    expect(key.rootPc).toBe(0);
    expect(key.kind).toBe("major");
  });

  it("pulls a stray pitch onto the scale", () => {
    const key = { rootPc: 0, kind: "major" as const, name: "C メジャー" };
    const [n] = snapMelodyToKey([note(61, 0, 1)], key); // C#
    expect(n!.midi).toBe(60);
  });
});

describe("melody voices", () => {
  it("has five named timbres with filter + envelope", () => {
    expect(MELODY_VOICES).toHaveLength(5);
    for (const v of MELODY_VOICES) {
      const spec = melodyVoiceSpec(v.id);
      expect(spec.layers.length).toBeGreaterThan(0);
      expect(spec.lp).toBeGreaterThan(200);
      expect(spec.peak).toBeGreaterThan(0);
    }
    expect(melodyVoiceSpec("bass").transpose).toBe(-12);
  });
});
