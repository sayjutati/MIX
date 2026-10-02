import { describe, expect, it } from "vitest";
import type { TimelineClip } from "../types";
import {
  canPlaceClip,
  findFreeStart,
  splitOpacityKeyframes,
  transitionOverlap,
  trimDeltaLimits,
} from "./timeline";

const clip = (id: string, start: number, duration: number, trackId = "v1"): TimelineClip => ({
  id,
  assetId: "a1",
  trackId,
  start,
  duration,
  inPoint: 0,
  speed: 1,
  volume: 1,
  opacity: 100,
  audioMuted: false,
  effects: {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    blur: 0,
    grayscale: 0,
    sepia: 0,
  },
  opacityKeyframes: [],
});

describe("canPlaceClip", () => {
  it("allows non-overlapping placement", () => {
    const clips = [clip("1", 0, 5)];
    expect(canPlaceClip(clips, "v1", 6, 3)).toBe(true);
  });

  it("rejects overlap", () => {
    const clips = [clip("1", 0, 5)];
    expect(canPlaceClip(clips, "v1", 3, 3)).toBe(false);
  });
});

describe("transitionOverlap", () => {
  it("returns overlap for crossfade with negative gap", () => {
    const a = { ...clip("1", 0, 5), transitionOut: { kind: "crossfade" as const, duration: 1 } };
    const b = clip("2", 4.5, 5);
    expect(transitionOverlap(a, b)).toBeGreaterThan(0);
  });

  it("returns overlap for adjacent clips with crossfade", () => {
    const a = { ...clip("1", 0, 5), transitionOut: { kind: "crossfade" as const, duration: 0.8 } };
    const b = clip("2", 5, 4);
    expect(transitionOverlap(a, b)).toBeCloseTo(0.8, 5);
  });
});

describe("findFreeStart", () => {
  it("returns desired start when free", () => {
    expect(findFreeStart([clip("1", 0, 5)], [{ trackId: "v1", duration: 2 }], 5)).toBe(5);
  });

  it("skips past blocking clips on any target track", () => {
    const clips = [clip("1", 5, 3, "v1"), clip("2", 8, 2, "a1")];
    const start = findFreeStart(
      clips,
      [
        { trackId: "v1", duration: 3 },
        { trackId: "a1", duration: 3 },
      ],
      5
    );
    expect(start).toBe(10);
  });
});

describe("trimDeltaLimits", () => {
  it("start edge cannot go before source start", () => {
    const c = { ...clip("1", 10, 5), inPoint: 2 };
    expect(trimDeltaLimits([c], c, "start", 100).min).toBeCloseTo(-2);
  });

  it("start edge cannot overlap the previous clip", () => {
    const prev = clip("p", 0, 8);
    const c = { ...clip("1", 10, 5), inPoint: 20 };
    expect(trimDeltaLimits([prev, c], c, "start", 100).min).toBeCloseTo(-2);
  });

  it("end edge is limited by the next clip and the source length", () => {
    const c = clip("1", 0, 5);
    const next = clip("n", 7, 3);
    expect(trimDeltaLimits([c, next], c, "end", 100).max).toBeCloseTo(2);
    expect(trimDeltaLimits([c], c, "end", 6).max).toBeCloseTo(1);
  });

  it("accounts for playback speed", () => {
    const c = { ...clip("1", 0, 5), speed: 2, inPoint: 0 };
    // 10s of source at 2x = 5s on the timeline, so 1s more source = 0.5s of timeline
    expect(trimDeltaLimits([c], c, "end", 11).max).toBeCloseTo(0.5);
  });
});

describe("splitOpacityKeyframes", () => {
  it("re-bases keyframes after the split and seeds the interpolated value", () => {
    const c = {
      ...clip("1", 0, 10),
      opacityKeyframes: [
        { id: "a", t: 0, value: 0 },
        { id: "b", t: 4, value: 100 },
        { id: "c", t: 8, value: 50 },
      ],
    };
    let n = 0;
    const out = splitOpacityKeyframes(c, 2, () => `k${n++}`);
    expect(out.map((k) => [k.t, k.value])).toEqual([
      [0, 50],
      [2, 100],
      [6, 50],
    ]);
  });

  it("returns [] when there are no keyframes", () => {
    expect(splitOpacityKeyframes(clip("1", 0, 10), 2, () => "x")).toEqual([]);
  });
});
