import { describe, expect, it } from "vitest";
import { analyzePitch } from "./pitchDetect";
import { estimateRootPitch, extractMelodyNotes } from "./melodyExtract";

const SR = 44100;

const sine = (freq: number, seconds: number, amp = 0.5): Float32Array => {
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
};

const concat = (...parts: Float32Array[]): Float32Array => {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
};

describe("extractMelodyNotes", () => {
  it("2音のメロディを2ノートに起こす（テンポ 120）", () => {
    // 各 0.5 秒 = 120BPM で 1 拍
    const samples = concat(sine(440, 0.5), sine(523.25, 0.5));
    const frames = analyzePitch(samples, SR);
    const notes = extractMelodyNotes(frames, { tempo: 120, quantGrid: 0.25 });

    expect(notes.length).toBe(2);
    expect(notes[0]!.pitch).toBe(69);
    expect(notes[1]!.pitch).toBe(72);
    expect(notes[0]!.start).toBeCloseTo(0, 1);
    expect(Math.abs(notes[1]!.start - 1)).toBeLessThan(0.3);
  });

  it("休符（無音）をまたぐとノートが分かれる", () => {
    const samples = concat(sine(330, 0.4), new Float32Array(Math.floor(0.3 * SR)), sine(330, 0.4));
    const frames = analyzePitch(samples, SR);
    const notes = extractMelodyNotes(frames, { tempo: 120 });
    expect(notes.length).toBe(2);
    expect(notes[0]!.pitch).toBe(64); // E4
    expect(notes[1]!.pitch).toBe(64);
  });

  it("無音のみならノートなし", () => {
    const frames = analyzePitch(new Float32Array(SR), SR);
    expect(extractMelodyNotes(frames, { tempo: 120 })).toEqual([]);
  });

  it("短すぎるノートは破棄される", () => {
    // 40ms の音は 120BPM で 0.08 拍 → minNoteBeats 0.2 未満
    const samples = concat(sine(440, 0.04), new Float32Array(SR));
    const frames = analyzePitch(samples, SR);
    const notes = extractMelodyNotes(frames, { tempo: 120 });
    expect(notes.length).toBe(0);
  });
});

describe("estimateRootPitch", () => {
  it("持続音の代表音高を返す", () => {
    const frames = analyzePitch(sine(220, 1), SR);
    const root = estimateRootPitch(frames);
    expect(root).not.toBeNull();
    expect(Math.round(root!)).toBe(57); // A3
  });

  it("無音なら null", () => {
    const frames = analyzePitch(new Float32Array(SR), SR);
    expect(estimateRootPitch(frames)).toBeNull();
  });
});
