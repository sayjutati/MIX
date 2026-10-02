import { describe, expect, it } from "vitest";
import { distributeLyrics, formatSrtTime, parseCaptions, toSrt } from "./captions";

describe("parseCaptions", () => {
  it("parses SRT with multi-line text, BOM and CRLF", () => {
    const srt = "\uFEFF1\r\n00:00:01,000 --> 00:00:03,500\r\nこんにちは\r\n世界\r\n\r\n2\r\n00:01:00,250 --> 00:01:02,000\r\nおわり\r\n";
    expect(parseCaptions(srt)).toEqual([
      { start: 1, end: 3.5, text: "こんにちは\n世界" },
      { start: 60.25, end: 62, text: "おわり" },
    ]);
  });

  it("parses WebVTT (dot ms, optional hours, cue settings, tags)", () => {
    const vtt = "WEBVTT\n\n00:01.000 --> 00:02.000 align:start\n<i>a</i>\n\n01:00:00.000 --> 01:00:01.000\nb";
    expect(parseCaptions(vtt)).toEqual([
      { start: 1, end: 2, text: "a" },
      { start: 3600, end: 3601, text: "b" },
    ]);
  });

  it("parses LRC; each line ends at the next stamp, last gets 3s, blank stamp ends a line", () => {
    const lrc = "[ti:song]\n[00:10.00]一行目\n[00:14.50]二行目\n[00:18.00]\n[00:20.00]三行目";
    expect(parseCaptions(lrc)).toEqual([
      { start: 10, end: 14.5, text: "一行目" },
      { start: 14.5, end: 18, text: "二行目" },
      { start: 20, end: 23, text: "三行目" },
    ]);
  });

  it("supports multiple stamps on one LRC line (repeated chorus)", () => {
    const cues = parseCaptions("[00:05.00][00:30.00]サビ\n[00:10.00]間");
    expect(cues.map((c) => [c.start, c.text])).toEqual([[5, "サビ"], [10, "間"], [30, "サビ"]]);
  });

  it("skips broken cues and returns [] for plain text", () => {
    expect(parseCaptions("1\n00:00:05,000 --> 00:00:04,000\nbackwards")).toEqual([]);
    expect(parseCaptions("ただの歌詞\n二行目")).toEqual([]);
    expect(parseCaptions("")).toEqual([]);
  });
});

describe("distributeLyrics", () => {
  it("splits evenly over the range and ignores blank lines", () => {
    expect(distributeLyrics("a\n\n b \nc\n", 10, 9)).toEqual([
      { start: 10, end: 13, text: "a" },
      { start: 13, end: 16, text: "b" },
      { start: 16, end: 19, text: "c" },
    ]);
  });
  it("returns [] for empty text or non-positive length", () => {
    expect(distributeLyrics("  \n", 0, 10)).toEqual([]);
    expect(distributeLyrics("a", 0, 0)).toEqual([]);
  });
});

describe("toSrt", () => {
  it("round-trips through parseCaptions in time order", () => {
    const cues = [
      { start: 3661.5, end: 3662, text: "later" },
      { start: 0.05, end: 1, text: "first" },
    ];
    const out = parseCaptions(toSrt(cues));
    expect(out.map((c) => c.text)).toEqual(["first", "later"]);
    expect(out[1]).toEqual(cues[0]);
    expect(formatSrtTime(3661.5)).toBe("01:01:01,500");
  });
});
