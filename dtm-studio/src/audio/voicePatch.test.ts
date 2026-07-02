import { describe, expect, it } from "vitest";
import { createVoice, renderVoicesAtTime, MAX_VOICES, type NoteEvent } from "./synthCore";
import { SYNTH_PATCHES } from "./voicePatch";
import type { InstrumentKind } from "../types/project";

const renderEvent = (ev: NoteEvent, seconds: number) => {
  const sr = 44100;
  const voices = Array.from({ length: MAX_VOICES }, createVoice);
  const eventIdx = { i: 0 };
  const lpL = { v: 0 };
  const lpR = { v: 0 };
  let peak = 0;
  let bad = false;
  const n = Math.floor(seconds * sr);
  for (let i = 0; i < n; i++) {
    const { l, r } = renderVoicesAtTime(voices, [ev], eventIdx, i / sr, sr, lpL, lpR);
    if (!Number.isFinite(l) || !Number.isFinite(r)) bad = true;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
  }
  return { peak, bad };
};

describe("voicePatch", () => {
  const kinds = Object.keys(SYNTH_PATCHES) as InstrumentKind[];

  it.each(kinds)("%s パッチは有音で NaN を出さない", (kind) => {
    const patch = SYNTH_PATCHES[kind]!;
    const ev: NoteEvent = {
      startSec: 0,
      endSec: 0.3,
      pitch: kind === "bass808" ? 40 : 60,
      velocity: 100,
      waveform: "saw",
      adsr: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.2 },
      pan: 0,
      volume: 1,
      patch,
    };
    const { peak, bad } = renderEvent(ev, 0.5);
    expect(bad).toBe(false);
    expect(peak).toBeGreaterThan(0.005);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it("クラップ・オープンハットのドラム音源が発音する", () => {
    for (const drumKind of ["clap", "openhat"] as const) {
      const ev: NoteEvent = {
        startSec: 0,
        endSec: 0.2,
        pitch: 60,
        velocity: 110,
        waveform: "noise",
        adsr: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 },
        pan: 0,
        volume: 1,
        drumKind,
      };
      const { peak, bad } = renderEvent(ev, 0.4);
      expect(bad).toBe(false);
      expect(peak).toBeGreaterThan(0.005);
    }
  });
});
