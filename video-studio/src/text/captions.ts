/** 字幕・歌詞ファイル（SRT / WebVTT / LRC）と素の歌詞テキストのパース・書き出し */

export type Cue = { start: number; end: number; text: string };

const LRC_DEFAULT_SEC = 3;

const stamp = (s: string): number | null => {
  // 00:01:02,500 / 01:02.500 / 1:02
  const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!m) return null;
  const frac = m[4] ? Number(m[4].padEnd(3, "0")) / 1000 : 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + frac;
};

const parseTimed = (text: string): Cue[] => {
  const cues: Cue[] = [];
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b] = lines[i]!.split("-->");
    const start = stamp(a ?? "");
    const end = stamp((b ?? "").trim().split(/\s+/)[0] ?? "");
    if (start == null || end == null || end <= start) continue;
    const body = lines.slice(i + 1).join("\n").replace(/<[^>]+>/g, "").trim();
    if (body) cues.push({ start, end, text: body });
  }
  return cues;
};

const parseLrc = (text: string): Cue[] => {
  const stamps: { t: number; text: string }[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const tags = [...raw.matchAll(/\[(\d+):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    if (!tags.length) continue;
    const body = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const tag of tags) {
      const t = Number(tag[1]) * 60 + Number(tag[2]!.replace(":", "."));
      stamps.push({ t, text: body });
    }
  }
  stamps.sort((x, y) => x.t - y.t);
  const cues: Cue[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const cur = stamps[i]!;
    if (!cur.text) continue; // 空行タグは直前の歌詞の終端として働く
    const next = stamps[i + 1];
    const end = next ? next.t : cur.t + LRC_DEFAULT_SEC;
    if (end > cur.t) cues.push({ start: cur.t, end, text: cur.text });
  }
  return cues;
};

/** 形式を自動判別。読み取れなければ空配列 */
export const parseCaptions = (text: string): Cue[] => {
  const t = text.replace(/^\uFEFF/, "");
  if (t.includes("-->")) return parseTimed(t);
  if (/\[\d+:\d{1,2}(?:[.:]\d{1,3})?\]/.test(t)) return parseLrc(t);
  return [];
};

/** タイミング無しの歌詞を、指定区間に行数で等分して割り当てる（空行は無視） */
export const distributeLyrics = (text: string, start: number, totalSec: number): Cue[] => {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length || totalSec <= 0) return [];
  const each = totalSec / lines.length;
  return lines.map((line, i) => ({ start: start + i * each, end: start + (i + 1) * each, text: line }));
};

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export const formatSrtTime = (sec: number): string => {
  const ms = Math.round(Math.max(0, sec) * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
};

export const toSrt = (cues: Cue[]): string =>
  [...cues]
    .sort((a, b) => a.start - b.start)
    .map((c, i) => `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}\n`)
    .join("\n");
