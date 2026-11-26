import { describe, expect, it } from "vitest";
import { mpegSampleRate } from "./lameEncoder";
import { pcmToMp3Bytes } from "./export";

describe("mpegSampleRate", () => {
  it("keeps legal MPEG rates", () => {
    expect(mpegSampleRate(44100)).toBe(44100);
    expect(mpegSampleRate(48000)).toBe(48000);
  });
  it("snaps unknown rates to the nearest legal one", () => {
    expect(mpegSampleRate(96000)).toBe(48000);
  });
});

describe("pcmToMp3Bytes", () => {
  it("encodes a stereo tone into a real MPEG frame", () => {
    const n = 44100;
    const left = new Int16Array(n);
    const right = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      left[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / n) * 16000);
      right[i] = left[i]!;
    }
    const mp3 = pcmToMp3Bytes(left, right, 44100, 192);
    expect(mp3.length).toBeGreaterThan(200);
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1]! & 0xe0).toBe(0xe0);
  });
});
