import { describe, expect, it } from "vitest";
import { makeNote, makeProject, makeTrack } from "../types/project";
import { buildNoteSchedules } from "./engine";

describe("buildNoteSchedules", () => {
  const base = makeProject({
    tempo: 120,
    tracks: [
      makeTrack({
        id: "t1",
        instrumentId: "inst-basic",
        volume: 0.8,
        notes: [makeNote({ id: "n1", pitch: 60, start: 2, duration: 1, velocity: 100 })],
      }),
      makeTrack({
        id: "t2",
        instrumentId: "inst-warm",
        muted: true,
        notes: [makeNote({ id: "n2", pitch: 64, start: 2, duration: 1 })],
      }),
    ],
  });

  it("ウィンドウ内のノートだけスケジュールする", () => {
    const notes = buildNoteSchedules(base, 1.5, 3, 10, 1.5, 120);
    expect(notes).toHaveLength(1);
    expect(notes[0].pitch).toBe(60);
    expect(notes[0].noteId).toBe("0:t1:n1");
  });

  it("muted トラックは除外", () => {
    const notes = buildNoteSchedules(base, 0, 8, 0, 0, 120);
    expect(notes.every((n) => n.noteId.startsWith("t2:"))).toBe(false);
  });

  it("solo 時は solo トラックのみ", () => {
    const solo = makeProject({
      tracks: [
        makeTrack({ id: "a", solo: true, notes: [makeNote({ pitch: 60, start: 0, duration: 1 })] }),
        makeTrack({ id: "b", notes: [makeNote({ pitch: 62, start: 0, duration: 1 })] }),
      ],
    });
    const notes = buildNoteSchedules(solo, 0, 4, 0, 0, 120);
    expect(notes).toHaveLength(1);
    expect(notes[0].noteId).toMatch(/^0:a:/);
  });

  it("tempo に応じて ctxTime が変わる", () => {
    const slow = buildNoteSchedules(base, 2, 3, 0, 2, 60);
    const fast = buildNoteSchedules(base, 2, 3, 0, 2, 240);
    expect(fast[0].durationSec).toBeLessThan(slow[0].durationSec);
  });

  it("volume / pan をトラックから引き継ぐ", () => {
    const p = makeProject({
      masterVolume: 1,
      tracks: [
        makeTrack({
          volume: 0.5,
          pan: -0.5,
          notes: [makeNote({ pitch: 60, start: 0, duration: 1 })],
        }),
      ],
    });
    const [n] = buildNoteSchedules(p, 0, 1, 0, 0, 120);
    expect(n.volume).toBe(0.5);
    expect(n.pan).toBe(-0.5);
  });

  it("masterVolume がトラック音量に乗算される", () => {
    const p = makeProject({
      masterVolume: 0.9,
      tracks: [
        makeTrack({
          volume: 0.5,
          notes: [makeNote({ pitch: 60, start: 0, duration: 1 })],
        }),
      ],
    });
    const [n] = buildNoteSchedules(p, 0, 1, 0, 0, 120);
    expect(n.volume).toBeCloseTo(0.45);
  });
});
