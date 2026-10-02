import { describe, expect, it } from "vitest";
import { detectBpm } from "./bpmDetect";
import { integratedLoudness, normalizeLoudness, samplePeak } from "./loudness";

const FS = 48000;

const sine = (freq: number, dbfs: number, sec: number) => {
  const a = Math.pow(10, dbfs / 20);
  const x = new Float32Array(Math.round(FS * sec));
  for (let i = 0; i < x.length; i++) x[i] = a * Math.sin((2 * Math.PI * freq * i) / FS);
  return x;
};

describe("integratedLoudness", () => {
  it("measures a -23 dBFS 997 Hz stereo sine as -23 LUFS (EBU Tech 3341)", () => {
    const x = sine(997, -23, 10);
    expect(integratedLoudness([x, x], FS)).toBeCloseTo(-23, 0);
  });

  it("is 3 dB lower for one channel only", () => {
    const x = sine(997, -23, 10);
    const both = integratedLoudness([x, x], FS);
    const mono = integratedLoudness([x, new Float32Array(x.length)], FS);
    expect(both - mono).toBeCloseTo(3.01, 1);
  });

  it("returns -Infinity for silence and too-short input", () => {
    expect(integratedLoudness([new Float32Array(FS * 5)], FS)).toBe(-Infinity);
    expect(integratedLoudness([sine(997, -20, 0.2)], FS)).toBe(-Infinity);
    expect(integratedLoudness([], FS)).toBe(-Infinity);
  });

  it("ignores long silence via gating", () => {
    const tone = sine(997, -23, 5);
    const padded = new Float32Array(tone.length + FS * 20);
    padded.set(tone);
    expect(integratedLoudness([padded, padded], FS)).toBeCloseTo(-23, 0);
  });
});

describe("normalizeLoudness", () => {
  it("brings a quiet signal to the target", () => {
    const l = sine(997, -30, 10);
    const r2 = sine(997, -30, 10);
    const r = normalizeLoudness([l, r2], FS, -14);
    expect(r.peakLimited).toBe(false);
    expect(integratedLoudness([l, r2], FS)).toBeCloseTo(-14, 0);
  });

  it("does not push peaks past the ceiling", () => {
    const x = sine(997, -30, 10);
    x[1000] = 0.9;
    const r = normalizeLoudness([x], FS, -5, -1);
    expect(r.peakLimited).toBe(true);
    expect(samplePeak([x])).toBeLessThanOrEqual(Math.pow(10, -1 / 20) + 1e-6);
  });

  it("leaves silence untouched", () => {
    const x = new Float32Array(FS * 2);
    expect(normalizeLoudness([x], FS).gainDb).toBe(0);
  });
});

describe("detectBpm", () => {
  const clicks = (bpm: number, sec: number) => {
    const x = new Float32Array(FS * sec);
    const period = (60 / bpm) * FS;
    for (let t = 0; t < x.length; t += period) {
      const s = Math.round(t);
      for (let i = 0; i < 400 && s + i < x.length; i++) {
        x[s + i] = Math.sin((2 * Math.PI * 1000 * i) / FS) * Math.exp(-i / 80);
      }
    }
    return x;
  };

  it.each([90, 120, 140])("detects %i BPM", (bpm) => {
    const r = detectBpm(clicks(bpm, 20), FS);
    expect(r).not.toBeNull();
    expect(Math.abs(r!.bpm - bpm)).toBeLessThan(1.5);
  });

  it("returns null for silence and very short audio", () => {
    expect(detectBpm(new Float32Array(FS * 10), FS)).toBeNull();
    expect(detectBpm(clicks(120, 1), FS)).toBeNull();
  });
});
