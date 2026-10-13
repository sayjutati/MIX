import { describe, expect, it } from "vitest";
import { applyNoiseGate, estimateNoiseFloor } from "./recordCleanup";

const tone = (n: number, amp: number) => {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.sin(i / 8) * amp;
  return a;
};

describe("recordCleanup", () => {
  it("estimates a low noise floor on quiet noise", () => {
    const quiet = new Float32Array(4800);
    for (let i = 0; i < quiet.length; i++) quiet[i] = (Math.random() - 0.5) * 0.002;
    expect(estimateNoiseFloor(quiet, 480)).toBeLessThan(0.01);
  });

  it("gates hush after a loud burst", () => {
    const d = new Float32Array(9600);
    d.set(tone(2400, 0.4));
    const ctx = {
      numberOfChannels: 1,
      sampleRate: 48000,
      length: 9600,
      getChannelData: () => d,
    } as unknown as AudioBuffer;
    applyNoiseGate(ctx, 0.002);
    const out = ctx.getChannelData(0);
    const tail = out.slice(7200);
    let peak = 0;
    for (const v of tail) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThan(0.05);
  });
});
