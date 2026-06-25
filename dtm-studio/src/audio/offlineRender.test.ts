import { describe, expect, it, beforeAll } from "vitest";
import { makeNote, makeProject, makeTrack } from "../types/project";
import {
  bufferPeak,
  collectNoteEvents,
  projectEndBeat,
  renderProjectOffline,
} from "./offlineRender";

beforeAll(() => {
  class MockAudioBuffer {
    length: number;
    numberOfChannels: number;
    sampleRate: number;
    private channels: Float32Array[] = [];
    constructor(opts: { length: number; numberOfChannels: number; sampleRate: number }) {
      this.length = opts.length;
      this.numberOfChannels = opts.numberOfChannels;
      this.sampleRate = opts.sampleRate;
    }
    copyToChannel(data: Float32Array, channel: number) {
      this.channels[channel] = data;
    }
    getChannelData(channel: number) {
      return this.channels[channel] ?? new Float32Array(this.length);
    }
  }
  (globalThis as unknown as { AudioBuffer: typeof MockAudioBuffer }).AudioBuffer =
    MockAudioBuffer;
});

describe("offlineRender", () => {
  it("projectEndBeat は最長ノート末尾を含む", () => {
    const p = makeProject({
      tracks: [
        makeTrack({
          notes: [makeNote({ pitch: 60, start: 8, duration: 4 })],
        }),
      ],
    });
    expect(projectEndBeat(p)).toBeGreaterThanOrEqual(12);
  });

  it("muted トラックはイベントに含めない", () => {
    const p = makeProject({
      tracks: [
        makeTrack({ muted: true, notes: [makeNote({ pitch: 60, start: 0, duration: 1 })] }),
        makeTrack({ notes: [makeNote({ pitch: 62, start: 0, duration: 1 })] }),
      ],
    });
    const ev = collectNoteEvents(p);
    expect(ev).toHaveLength(1);
    expect(ev[0].pitch).toBe(62);
  });

  it("ノートありプロジェクトは無音でない WAV バッファになる", async () => {
    const p = makeProject({
      tracks: [
        makeTrack({
          notes: [
            makeNote({ pitch: 60, start: 0, duration: 1 }),
            makeNote({ pitch: 64, start: 1, duration: 1 }),
          ],
        }),
      ],
    });
    const buf = await renderProjectOffline(p, { tailSec: 0.2 });
    expect(buf.length).toBeGreaterThan(1000);
    expect(bufferPeak(buf)).toBeGreaterThan(0.01);
  });
});
