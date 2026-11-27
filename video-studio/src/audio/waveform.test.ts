import { describe, expect, it } from "vitest";
import { slicePeaksForClip } from "./waveform";

describe("slicePeaksForClip", () => {
  it("slices only the trimmed source window [inPoint, inPoint + duration * speed]", () => {
    // 0..5s が無音(0.1), 5..10s が大音量(0.9) の10秒音源
    const peaks = [
      ...Array.from({ length: 50 }, () => 0.1),
      ...Array.from({ length: 50 }, () => 0.9),
    ];
    const data = { peaks, duration: 10 };

    const firstHalf = slicePeaksForClip(data, 0, 5, 1, 10);
    const secondHalf = slicePeaksForClip(data, 5, 5, 1, 10);
    expect(firstHalf.every((v) => v <= 0.15)).toBe(true);
    expect(secondHalf.every((v) => v >= 0.85)).toBe(true);
  });
});
