import { describe, expect, it } from "vitest";
import { resolveDrumVoice, drumKeyboardLabel } from "./drumMap";
import { resolveVoiceParams } from "./instrumentVoice";
import { DEFAULT_INSTRUMENTS } from "../types/project";

describe("drumMap", () => {
  it("キックは専用エンジン", () => {
    const v = resolveDrumVoice(36);
    expect(v.drumKind).toBe("kick");
  });

  it("スネアは snare", () => {
    expect(resolveDrumVoice(38).drumKind).toBe("snare");
  });

  it("鍵盤ラベル", () => {
    expect(drumKeyboardLabel(36)).toBe("キック");
    expect(drumKeyboardLabel(99)).toBeNull();
  });
});

describe("instrumentVoice", () => {
  it("シンセはノートピッチをそのまま使う", () => {
    const inst = DEFAULT_INSTRUMENTS[0];
    const v = resolveVoiceParams(inst, 60);
    expect(v.pitch).toBe(60);
    expect(v.waveform).toBe("saw");
  });

  it("ドラムはマップを適用", () => {
    const drum = DEFAULT_INSTRUMENTS.find((i) => i.id === "inst-drum")!;
    const v = resolveVoiceParams(drum, 36);
    expect(v.drumKind).toBe("kick");
  });
});
