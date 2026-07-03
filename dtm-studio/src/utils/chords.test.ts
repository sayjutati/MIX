import { describe, expect, it } from "vitest";
import {
  chordName,
  chordsEndBeat,
  diatonicChords,
  generateChordNotes,
  presetToChords,
  PROGRESSION_PRESETS,
  voiceChordGuitar,
  voiceChordPiano,
} from "./chords";
import { makeChordEvent } from "../types/project";

describe("chords", () => {
  it("コード名を正しく表記する", () => {
    expect(chordName(0, "maj")).toBe("C");
    expect(chordName(9, "min")).toBe("Am");
    expect(chordName(5, "maj7")).toBe("FM7");
    expect(chordName(11, "m7b5")).toBe("Bm7♭5");
  });

  it("C メジャーキーのダイアトニックコード", () => {
    const triads = diatonicChords(0, false);
    expect(triads.map((c) => chordName(c.root, c.quality))).toEqual([
      "C", "Dm", "Em", "F", "G", "Am", "Bdim",
    ]);
    expect(triads[0]!.roman).toBe("I");
    expect(triads[1]!.roman).toBe("ii");
    expect(triads[6]!.roman).toBe("vii°");

    const sevenths = diatonicChords(0, true);
    expect(chordName(sevenths[4]!.root, sevenths[4]!.quality)).toBe("G7");
  });

  it("プリセットはキーに追従し1小節刻みで並ぶ", () => {
    const canon = PROGRESSION_PRESETS.find((p) => p.id === "canon")!;
    const chords = presetToChords(canon, 2, 8); // Dメジャー、8拍目から
    expect(chords).toHaveLength(8);
    expect(chords[0]).toMatchObject({ root: 2, quality: "maj", startBeat: 8, durationBeats: 4 });
    expect(chords[1]!.startBeat).toBe(12);
    expect(chords[1]!.root).toBe(9); // A
  });

  it("ピアノボイシングはボイスリーディングで移動が小さい", () => {
    const c = voiceChordPiano(0, "maj");
    const g = voiceChordPiano(7, "maj", c);
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    // 素の G(55,59,62) より C(48,52,55) に近い転回形が選ばれる
    expect(Math.abs(avg(g) - avg(c))).toBeLessThan(4);
  });

  it("ギターボイシングは低音ルートで昇順", () => {
    const e = voiceChordGuitar(4, "maj");
    expect(e[0]).toBe(40); // E2
    for (let i = 1; i < e.length; i++) expect(e[i]!).toBeGreaterThanOrEqual(e[i - 1]!);
  });

  it("ノート生成は範囲内に収まり音域も有効", () => {
    const chords = [
      makeChordEvent({ root: 0, startBeat: 0, quality: "maj", durationBeats: 4 }),
      makeChordEvent({ root: 7, startBeat: 4, quality: "7", durationBeats: 4 }),
    ];
    for (const pattern of ["block", "quarter", "eighth", "arp8"] as const) {
      for (const target of ["piano", "guitar"] as const) {
        const notes = generateChordNotes(chords, target, pattern);
        expect(notes.length).toBeGreaterThan(0);
        for (const n of notes) {
          expect(n.start).toBeGreaterThanOrEqual(0);
          expect(n.start + n.duration).toBeLessThanOrEqual(8.2);
          expect(n.pitch).toBeGreaterThanOrEqual(36);
          expect(n.pitch).toBeLessThanOrEqual(84);
          expect(n.velocity).toBeGreaterThan(0);
        }
      }
    }
    expect(chordsEndBeat(chords)).toBe(8);
  });
});
