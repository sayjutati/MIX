import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveAutosave = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("./autosave", () => ({ saveAutosave }));

import { AutosaveScheduler } from "./autosaveScheduler";
import { createTrack } from "../types";

const snap = () => ({
  tracks: [createTrack({ id: 1, name: "t", url: "blob:x" })],
  bpm: 120,
  masterVolume: 1,
  globalTime: 0,
  pitchLimit: 2,
});

describe("AutosaveScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("document", { visibilityState: "visible" });
    saveAutosave.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not re-serialize on the interval when nothing changed", async () => {
    const s = new AutosaveScheduler();
    const stop = s.start(snap);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(saveAutosave).not.toHaveBeenCalled();
    stop();
  });

  it("saves once after a change, then goes quiet", async () => {
    const s = new AutosaveScheduler();
    const stop = s.start(snap);
    s.schedule(4000);
    await vi.advanceTimersByTimeAsync(4_100);
    expect(saveAutosave).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(saveAutosave).toHaveBeenCalledTimes(1);
    stop();
  });

  it("retries on the interval after a failed save", async () => {
    saveAutosave.mockRejectedValueOnce(new Error("quota"));
    const s = new AutosaveScheduler();
    const stop = s.start(snap);
    s.schedule(1000);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(saveAutosave).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(saveAutosave).toHaveBeenCalledTimes(2);
    stop();
  });

  it("flush() always saves immediately", async () => {
    const s = new AutosaveScheduler();
    const stop = s.start(snap);
    s.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(saveAutosave).toHaveBeenCalledTimes(1);
    stop();
  });
});
