import { describe, expect, it } from "vitest";
import { pitchJaKeyboardLabel, pitchJaName, pitchJaRangeLabel } from "./pitchLabel";

describe("pitchLabel", () => {
  it("pitchJaName はドレミ + オクターブ", () => {
    expect(pitchJaName(60)).toBe("ド4");
    expect(pitchJaName(61)).toBe("ド#4");
    expect(pitchJaName(36)).toBe("ド2");
  });

  it("pitchJaRangeLabel は範囲を示す", () => {
    expect(pitchJaRangeLabel(36, 84)).toBe("ド2 – ド6");
  });

  it("白鍵は音名、ドのみオクターブ付き", () => {
    expect(pitchJaKeyboardLabel(60, false)).toBe("ド4");
    expect(pitchJaKeyboardLabel(62, false)).toBe("レ");
    expect(pitchJaKeyboardLabel(61, true)).toBe("ド#");
  });
});
