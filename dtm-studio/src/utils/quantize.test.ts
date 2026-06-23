import { describe, expect, it } from "vitest";
import { snapBeat } from "./quantize";

describe("snapBeat", () => {
  it("スナップ先の 1/4 グリッドに丸める", () => {
    expect(snapBeat(1.12, 1)).toBe(1);
    expect(snapBeat(1.6, 1)).toBe(2);
  });

  it("1/16 グリッド", () => {
    expect(snapBeat(0.13, 0.25)).toBe(0.25);
    expect(snapBeat(0.11, 0.25)).toBe(0);
  });

  it("負の grid はそのまま返す", () => {
    expect(snapBeat(1.5, 0)).toBe(1.5);
  });
});
