import { describe, expect, it } from "vitest";
import { clipOpacityAt, projectDuration, timeFromTimelineX, timelineX } from "./types";

describe("timeline coordinates", () => {
  it("converts seconds to x and back", () => {
    const x = timelineX(10, 50);
    expect(timeFromTimelineX(x, 50)).toBeCloseTo(10, 5);
  });
});

describe("clipOpacityAt", () => {
  it("interpolates keyframes", () => {
    const opacity = clipOpacityAt(
      {
        id: "1",
        assetId: "a",
        trackId: "v",
        start: 0,
        duration: 10,
        inPoint: 0,
        speed: 1,
        volume: 1,
        opacity: 50,
        audioMuted: false,
        effects: {
          brightness: 100,
          contrast: 100,
          saturation: 100,
          blur: 0,
          grayscale: 0,
          sepia: 0,
        },
        opacityKeyframes: [
          { id: "k1", t: 0, value: 0 },
          { id: "k2", t: 2, value: 100 },
        ],
      },
      1
    );
    expect(opacity).toBe(50);
  });
});

describe("projectDuration", () => {
  it("returns max clip end", () => {
    expect(
      projectDuration(
        [
          {
            id: "1",
            assetId: "a",
            trackId: "v",
            start: 5,
            duration: 10,
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
          },
        ],
        []
      )
    ).toBe(15);
  });
});
