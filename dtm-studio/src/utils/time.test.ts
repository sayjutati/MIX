import { describe, expect, it } from "vitest";
import { beatToDisplaySec, formatBarsBeats, formatBeatPosition, formatTime, secToBeat } from "./time";

describe("time utils", () => {
  it("formatTime は MM:SS.d 形式", () => {
    expect(formatTime(65.34)).toBe("01:05.3");
    expect(formatTime(0)).toBe("00:00.0");
  });

  it("formatBarsBeats は小節.拍.補助", () => {
    expect(formatBarsBeats(0, 120)).toBe("1.1.1");
    expect(formatBarsBeats(2, 120)).toBe("2.1.1");
  });

  it("formatBeatPosition は拍から DAW 形式へ", () => {
    expect(formatBeatPosition(4, 120)).toBe("2.1.1");
  });

  it("beatToDisplaySec / secToBeat が往復できる", () => {
    const beat = 8;
    const sec = beatToDisplaySec(beat, 120);
    expect(secToBeat(sec, 120)).toBeCloseTo(beat);
  });
});
