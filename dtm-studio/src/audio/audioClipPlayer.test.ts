import { describe, expect, it, vi } from "vitest";

vi.mock("./engine", () => ({ getAudioContext: async () => ({}) }));
vi.mock("../storage/audioAssetStorage", () => ({ getAudioAssetUrl: async () => null }));

import { resolveClipTiming } from "./audioClipPlayer";

describe("resolveClipTiming", () => {
  it("未来の開始時刻はそのまま", () => {
    expect(resolveClipTiming(1, { ctxTime: 2, offsetSec: 0.5, durationSec: 4 })).toEqual({
      when: 2,
      offsetSec: 0.5,
      durationSec: 4,
    });
  });

  it("開始時刻を過ぎていたら経過分だけ頭出しする（途中シーク）", () => {
    const t = resolveClipTiming(10, { ctxTime: 8, offsetSec: 1, durationSec: 5 })!;
    expect(t.when).toBeCloseTo(10.005);
    expect(t.offsetSec).toBeCloseTo(1 + 2.005);
    expect(t.durationSec).toBeCloseTo(5 - 2.005);
  });

  it("すでに終わっているクリップは再生しない", () => {
    expect(resolveClipTiming(20, { ctxTime: 8, offsetSec: 0, durationSec: 5 })).toBeNull();
  });
});
