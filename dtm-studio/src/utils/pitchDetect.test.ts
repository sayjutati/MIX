import { describe, expect, it } from "vitest";
import { analyzePitch, detectPitchYin, freqToMidiFloat } from "./pitchDetect";

const SR = 44100;

const sine = (freq: number, seconds: number, amp = 0.5): Float32Array => {
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
};

describe("detectPitchYin", () => {
  it("純音の周波数を 1% 以内で検出する", () => {
    for (const f of [110, 220, 440, 523.25]) {
      const frame = sine(f, 2048 / SR + 0.01).subarray(0, 2048);
      const { freq, clarity } = detectPitchYin(frame, SR);
      expect(Math.abs(freq - f) / f).toBeLessThan(0.01);
      expect(clarity).toBeGreaterThan(0.8);
    }
  });

  it("ノイズ混じりでも検出できる", () => {
    const frame = sine(220, 2048 / SR + 0.01).subarray(0, 2048);
    let seed = 1;
    const noisy = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      noisy[i] = frame[i]! + (seed / 0x7fffffff - 0.5) * 0.1;
    }
    const { freq } = detectPitchYin(noisy, SR);
    expect(Math.abs(freq - 220) / 220).toBeLessThan(0.02);
  });

  it("無音は freq 0 を返す", () => {
    const { freq } = detectPitchYin(new Float32Array(2048), SR);
    expect(freq).toBe(0);
  });
});

describe("analyzePitch", () => {
  it("2音の連続音声を追跡する", () => {
    const a = sine(440, 0.5);
    const b = sine(523.25, 0.5);
    const samples = new Float32Array(a.length + b.length);
    samples.set(a, 0);
    samples.set(b, a.length);

    const frames = analyzePitch(samples, SR);
    expect(frames.length).toBeGreaterThan(50);

    const early = frames.filter((f) => f.timeSec < 0.4 && f.freq > 0);
    const late = frames.filter((f) => f.timeSec > 0.6 && f.freq > 0);
    expect(early.length).toBeGreaterThan(10);
    expect(late.length).toBeGreaterThan(10);

    const midiEarly = freqToMidiFloat(early[5]!.freq);
    const midiLate = freqToMidiFloat(late[5]!.freq);
    expect(Math.round(midiEarly)).toBe(69); // A4
    expect(Math.round(midiLate)).toBe(72); // C5
  });
});
