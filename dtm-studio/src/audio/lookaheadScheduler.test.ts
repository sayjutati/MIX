import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => {
  let release: () => void = () => {};
  const state = {
    pending: Promise.resolve(),
    hold() {
      state.pending = new Promise<void>((r) => {
        release = r;
      });
    },
    open() {
      release();
    },
  };
  return state;
});

const calls = vi.hoisted(() => ({
  startTransport: vi.fn(),
  stopTransport: vi.fn(),
  scheduleNotes: vi.fn(),
  clipSchedule: vi.fn(async () => {}),
}));

vi.mock("./engine", () => {
  const ctx = { currentTime: 0 };
  const node = { port: { postMessage: vi.fn() } };
  return {
    LOOKAHEAD_MS: 25,
    SCHEDULE_AHEAD_SEC: 0.25,
    initAudioGraph: async () => {
      await gate.pending;
      return { ctx, clock: node, synth: node };
    },
    onClockPosition: () => () => {},
    startTransport: calls.startTransport,
    stopTransport: calls.stopTransport,
    seekTransport: vi.fn(),
    scheduleNotesToSynth: calls.scheduleNotes,
    buildNoteSchedules: () => [
      { noteId: "n1", ctxTime: 0, pitch: 60, velocity: 100, durationSec: 1, noteOffTime: 1 },
    ],
  };
});

vi.mock("./audioClipPlayer", () => ({
  audioClipPlayer: {
    ensureGraph: async () => {},
    clearScheduled: vi.fn(),
    schedule: calls.clipSchedule,
  },
  buildClipSchedules: () => [],
}));

vi.mock("./offlineRender", () => ({ projectEndBeat: () => 1000 }));

import { LookaheadScheduler } from "./lookaheadScheduler";

describe("LookaheadScheduler start/stop race", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.values(calls).forEach((f) => f.mockClear());
    gate.pending = Promise.resolve();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stop() が start() の初期化完了前に呼ばれたら再生を開始しない", async () => {
    const s = new LookaheadScheduler();
    gate.hold();
    const starting = s.start(0);
    const stopping = s.stop();
    gate.open();
    await Promise.all([starting, stopping]);

    expect(calls.startTransport).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(calls.scheduleNotes).not.toHaveBeenCalled();
  });

  it("start() を連続で呼んでも stop() で全 tick が止まる", async () => {
    const s = new LookaheadScheduler();
    await s.start(0);
    await s.start(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(calls.scheduleNotes).toHaveBeenCalled();

    await s.stop();
    calls.scheduleNotes.mockClear();
    await vi.advanceTimersByTimeAsync(500);
    expect(calls.scheduleNotes).not.toHaveBeenCalled();
  });

  it("stop → start の直後に古い stop が新しい再生を止めない", async () => {
    const s = new LookaheadScheduler();
    await s.start(0);
    gate.hold();
    const stopping = s.stop();
    const restarting = s.start(0);
    gate.open();
    await Promise.all([stopping, restarting]);

    expect(calls.stopTransport).not.toHaveBeenCalled();
    expect(calls.startTransport).toHaveBeenCalledTimes(2);
    await s.stop();
  });
});
