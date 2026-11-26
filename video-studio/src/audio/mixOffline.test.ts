import { describe, expect, it } from "vitest";
import { clipSourceWindow } from "./mixOffline";

describe("clipSourceWindow", () => {
  const clip = { start: 1, duration: 4, inPoint: 0.5, speed: 1 };

  it("maps timeline to buffer offset", () => {
    const w = clipSourceWindow(clip, 10, 20)!;
    expect(w.when).toBe(1);
    expect(w.offset).toBe(0.5);
    expect(w.srcDur).toBe(4);
  });

  it("clamps to mix length and buffer length", () => {
    expect(clipSourceWindow({ ...clip, duration: 50 }, 3, 20)?.srcDur).toBeCloseTo(2.5);
    expect(clipSourceWindow({ ...clip, start: 18 }, 10, 20)?.srcDur).toBeCloseTo(2);
  });

  it("skips clips that cannot produce audio", () => {
    expect(clipSourceWindow(clip, 0.2, 20)).toBeNull();
    expect(clipSourceWindow({ ...clip, start: 20 }, 10, 20)).toBeNull();
    expect(clipSourceWindow({ ...clip, inPoint: 10 }, 10, 20)).toBeNull();
  });
});
