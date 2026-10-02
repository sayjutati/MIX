import { describe, expect, it } from "vitest";
import { mixdownDuration } from "./mixdown";
import { createTrack, type Track } from "../types";

const track = (id: number, over: Partial<Track> = {}, duration = 4, offset = 0): Track => ({
  ...createTrack({ id, name: `t${id}`, url: "blob:x", duration, offset }),
  ...over,
});

describe("mixdownDuration", () => {
  it("uses clip end with speed and nudge", () => {
    const t = track(1, { speed: 2, nudgeMs: 500 }, 4, 1);
    expect(mixdownDuration([t], false)).toBeCloseTo(1 + 0.5 + 2);
  });

  it("ignores muted tracks and solo-excluded tracks", () => {
    const short = track(1, {}, 2);
    const longMuted = track(2, { isMuted: true }, 30);
    const longNotSolo = track(3, {}, 40);
    expect(mixdownDuration([short, longMuted], false)).toBeCloseTo(2);
    expect(mixdownDuration([{ ...short, isSolo: true }, longNotSolo], true)).toBeCloseTo(2);
  });

  it("ignores muted clips", () => {
    const t = track(1, {}, 2);
    t.clips.push({ ...t.clips[0], id: 99, offset: 20, muted: true });
    expect(mixdownDuration([t], false)).toBeCloseTo(2);
  });

  it("adds an effect tail so reverb/delay are not cut off", () => {
    expect(mixdownDuration([track(1, { reverb: 0.3 }, 3)], false)).toBeCloseTo(3 + 2.4);
    expect(mixdownDuration([track(1, { delay: 0.3 }, 3)], false)).toBeCloseTo(3 + 1.5);
  });

  it("is at least 1 second, even with nothing audible", () => {
    expect(mixdownDuration([], false)).toBe(1);
    expect(mixdownDuration([track(1, { isMuted: true })], false)).toBe(1);
  });

  it("treats speed 0 as 1 instead of producing Infinity", () => {
    expect(mixdownDuration([track(1, { speed: 0 }, 3)], false)).toBeCloseTo(3);
  });
});
