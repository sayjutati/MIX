import { describe, expect, it } from "vitest";
import type { TimelineClip } from "../types";
import { canPlaceClip, transitionOverlap } from "./timeline";

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
});
