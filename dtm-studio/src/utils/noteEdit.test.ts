import { describe, expect, it } from "vitest";
import { paintBeatsBetween, scaleNotesTiming } from "./noteEdit";
import { makeNote } from "../types/project";

describe("scaleNotesTiming", () => {
  it("scales start and duration from anchor", () => {
    const a = makeNote({ pitch: 60, start: 0, duration: 1, velocity: 100 });
    const b = makeNote({ pitch: 62, start: 2, duration: 1, velocity: 100 });
    const patches = scaleNotesTiming([a, b], 0, 2);
    expect(patches[0]?.patch.start).toBe(0);
    expect(patches[0]?.patch.duration).toBe(2);
    expect(patches[1]?.patch.start).toBe(4);
    expect(patches[1]?.patch.duration).toBe(2);
  });

  it("clamps factor", () => {
    const n = makeNote({ pitch: 60, start: 1, duration: 1, velocity: 100 });
    const patches = scaleNotesTiming([n], 0, 0);
    expect(patches[0]?.patch.start).toBeGreaterThanOrEqual(0);
  });
});

describe("paintBeatsBetween", () => {
  it("covers cells from a to b", () => {
    expect(paintBeatsBetween(0, 1, 0.25)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
});
