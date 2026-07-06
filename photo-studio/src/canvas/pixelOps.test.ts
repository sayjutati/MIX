import { beforeAll, describe, expect, it } from "vitest";
import { applyAdjustments, clamp255, hashPrompt } from "./pixelOps";
import { defaultAdjustments } from "../types/document";

beforeAll(() => {
  if (typeof globalThis.ImageData === "undefined") {
    globalThis.ImageData = class implements ImageData {
      colorSpace: PredefinedColorSpace = "srgb";
      readonly width: number;
      readonly height: number;
      readonly data: Uint8ClampedArray;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        this.data = new Uint8ClampedArray(w * h * 4);
      }
    } as unknown as typeof ImageData;
  }
});

describe("pixelOps", () => {
  it("clamp255", () => {
    expect(clamp255(300)).toBe(255);
    expect(clamp255(-10)).toBe(0);
    expect(clamp255(128.4)).toBe(128);
  });

  it("hashPrompt is deterministic", () => {
    expect(hashPrompt("sunset")).toBe(hashPrompt("sunset"));
    expect(hashPrompt("a")).not.toBe(hashPrompt("b"));
  });

  it("applyAdjustments preserves alpha", () => {
    const src = new ImageData(1, 1);
    src.data[0] = 100;
    src.data[1] = 120;
    src.data[2] = 140;
    src.data[3] = 200;

    const out = applyAdjustments(src, defaultAdjustments());
    expect(out.data[3]).toBe(200);
    expect(out.width).toBe(1);
  });
});
