import { describe, expect, it } from "vitest";
import { makeNote, makeProject, makeTrack } from "../types/project";
import { importMidiAsNewTrack, parseMidi, projectToMidi } from "./midi";

describe("midi", () => {
  it("projectToMidi → parseMidi でノートが復元される", () => {
    const p = makeProject({
      tempo: 100,
      tracks: [
        makeTrack({
          notes: [
            makeNote({ pitch: 60, start: 0, duration: 1, velocity: 90 }),
            makeNote({ pitch: 64, start: 2, duration: 0.5, velocity: 80 }),
          ],
        }),
      ],
    });
    const bytes = projectToMidi(p);
    const parsed = parseMidi(bytes);
    expect(parsed.tempo).toBeCloseTo(100, 0);
    expect(parsed.notes).toHaveLength(2);
    expect(parsed.notes[0].pitch).toBe(60);
    expect(parsed.notes[0].start).toBeCloseTo(0, 2);
    expect(parsed.notes[1].pitch).toBe(64);
    expect(parsed.notes[1].start).toBeCloseTo(2, 1);
  });

  it("importMidiAsNewTrack はトラックを追加する", () => {
    const p = makeProject({ tracks: [makeTrack({ name: "A" })] });
    const parsed = {
      tempo: 120,
      notes: [{ pitch: 72, start: 0, duration: 1, velocity: 100 }],
    };
    const next = importMidiAsNewTrack(p, parsed, "From MIDI");
    expect(next.tracks).toHaveLength(2);
    expect(next.tracks[1].name).toBe("From MIDI");
    expect(next.tracks[1].notes).toHaveLength(1);
  });
});
