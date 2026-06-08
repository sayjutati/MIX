import { describe, expect, it } from "vitest";
import type { TextClip } from "../types";
import { defaultEffects } from "../types";
import { defaultTextStyle } from "./textStyle";
import { computeTelopTransform } from "./renderText";

const baseClip = (): TextClip => ({
  id: "t1",
  assetId: "text-internal",
  trackId: "t1",
  start: 0,
  duration: 15,
  inPoint: 0,
  speed: 1,
  volume: 1,
  opacity: 100,
  audioMuted: true,
  effects: defaultEffects(),
  opacityKeyframes: [],
  text: "Line1\nLine2",
  x: 0.5,
  y: 0.5,
  style: defaultTextStyle(),
});

describe("computeTelopTransform scroll", () => {
  it("scrollUp ends at zero offset after scroll duration", () => {
    const clip = baseClip();
    clip.style.animation = {
      in: "scrollUp",
      out: "fade",
      inDuration: 5,
      outDuration: 1,
      holdDuration: 3,
    };
    const block = { width: 200, height: 120 };
    const mid = computeTelopTransform(clip, 2.5, 1280, 720, block);
    const end = computeTelopTransform(clip, 6, 1280, 720, block);
    expect(mid.offsetY).toBeGreaterThan(0);
    expect(end.offsetY).toBe(0);
  });

  it("scrollLeft moves horizontally over clip", () => {
    const clip = baseClip();
    clip.style.animation = {
      in: "scrollLeft",
      out: "none",
      inDuration: 0,
      outDuration: 0,
      holdDuration: 0,
    };
    const block = { width: 300, height: 40 };
    const start = computeTelopTransform(clip, 0, 1280, 720, block);
    const later = computeTelopTransform(clip, 7, 1280, 720, block);
    expect(start.offsetX).toBeGreaterThan(later.offsetX);
  });
});
