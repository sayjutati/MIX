import { describe, expect, it } from "vitest";
import { bandLimitedSaw, kickFreqAt, softClip, velocityGain } from "./oscCore";

describe("oscCore", () => {
  it("PolyBLEP saw は ±1 以内", () => {
    for (let i = 0; i < 512; i++) {
      const phase = (i / 512) * Math.PI * 2;
      const inc = (440 / 44100) * Math.PI * 2;
      const s = bandLimitedSaw(phase, inc);
      expect(s).toBeGreaterThanOrEqual(-1.05);
      expect(s).toBeLessThanOrEqual(1.05);
    }
  });

  it("キック周波数は時間とともに下がる", () => {
    expect(kickFreqAt(0, 0)).toBeGreaterThan(kickFreqAt(0, 0.05));
  });

  it("ソフトクリップは過大入力を抑える", () => {
    expect(Math.abs(softClip(3))).toBeLessThan(1);
  });

  it("ベロシティカーブ", () => {
    expect(velocityGain(127)).toBeCloseTo(1, 2);
    expect(velocityGain(64)).toBeGreaterThan(0.4);
  });
});
