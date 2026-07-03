import type { ChordEvent, ChordQuality, MidiNote } from "../types/project";

/** ルート音の表示名（シャープ表記） */
export const ROOT_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** コード品質 → 半音インターバル（ルートから） */
export const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dim: [0, 3, 6],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 14],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "9": [0, 4, 7, 10, 14],
};

/** コード品質のサフィックス表記 */
export const QUALITY_LABELS: Record<ChordQuality, string> = {
  maj: "",
  min: "m",
  "7": "7",
  maj7: "M7",
  min7: "m7",
  dim: "dim",
  m7b5: "m7♭5",
  aug: "aug",
  sus2: "sus2",
  sus4: "sus4",
  add9: "add9",
  "6": "6",
  m6: "m6",
  "9": "9",
};

export const ALL_QUALITIES = Object.keys(CHORD_INTERVALS) as ChordQuality[];

export const chordName = (root: number, quality: ChordQuality): string =>
  `${ROOT_NAMES[((root % 12) + 12) % 12]}${QUALITY_LABELS[quality]}`;

/* ------------------------------------------------------------------ */
/* ダイアトニックコード                                                  */
/* ------------------------------------------------------------------ */

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

const TRIAD_QUALITIES: ChordQuality[] = ["maj", "min", "min", "maj", "maj", "min", "dim"];
const SEVENTH_QUALITIES: ChordQuality[] = ["maj7", "min7", "min7", "maj7", "7", "min7", "m7b5"];

export type DiatonicChord = {
  /** 度数 0〜6 */
  degree: number;
  /** ローマ数字表記（小文字 = マイナー） */
  roman: string;
  root: number;
  quality: ChordQuality;
};

/** メジャーキーのダイアトニックコード一覧 */
export const diatonicChords = (keyRoot: number, sevenths: boolean): DiatonicChord[] =>
  MAJOR_SCALE.map((offset, degree) => {
    const quality = (sevenths ? SEVENTH_QUALITIES : TRIAD_QUALITIES)[degree]!;
    const minor = quality === "min" || quality === "min7";
    const dim = quality === "dim" || quality === "m7b5";
    const roman = minor || dim ? ROMAN[degree]!.toLowerCase() : ROMAN[degree]!;
    return {
      degree,
      roman: dim ? `${roman}°` : roman,
      root: (keyRoot + offset) % 12,
      quality,
    };
  });

/* ------------------------------------------------------------------ */
/* 定番進行プリセット                                                    */
/* ------------------------------------------------------------------ */

export type ProgressionPreset = {
  id: string;
  name: string;
  /** キーのルートからの半音オフセット＋品質。1要素 = 1小節（4拍） */
  chords: { semi: number; quality: ChordQuality }[];
};

export const PROGRESSION_PRESETS: ProgressionPreset[] = [
  {
    id: "canon",
    name: "カノン進行 (I-V-vi-iii-IV-I-IV-V)",
    chords: [
      { semi: 0, quality: "maj" },
      { semi: 7, quality: "maj" },
      { semi: 9, quality: "min" },
      { semi: 4, quality: "min" },
      { semi: 5, quality: "maj" },
      { semi: 0, quality: "maj" },
      { semi: 5, quality: "maj" },
      { semi: 7, quality: "maj" },
    ],
  },
  {
    id: "oudou",
    name: "王道進行 (IV-V-iii-vi)",
    chords: [
      { semi: 5, quality: "maj7" },
      { semi: 7, quality: "7" },
      { semi: 4, quality: "min7" },
      { semi: 9, quality: "min7" },
    ],
  },
  {
    id: "komuro",
    name: "小室進行 (vi-IV-V-I)",
    chords: [
      { semi: 9, quality: "min" },
      { semi: 5, quality: "maj" },
      { semi: 7, quality: "maj" },
      { semi: 0, quality: "maj" },
    ],
  },
  {
    id: "poppunk",
    name: "ポップパンク (I-V-vi-IV)",
    chords: [
      { semi: 0, quality: "maj" },
      { semi: 7, quality: "maj" },
      { semi: 9, quality: "min" },
      { semi: 5, quality: "maj" },
    ],
  },
  {
    id: "marusa",
    name: "丸サ進行 (IVM7-III7-vim7-I7)",
    chords: [
      { semi: 5, quality: "maj7" },
      { semi: 4, quality: "7" },
      { semi: 9, quality: "min7" },
      { semi: 0, quality: "7" },
    ],
  },
  {
    id: "blues12",
    name: "12小節ブルース",
    chords: [
      { semi: 0, quality: "7" },
      { semi: 0, quality: "7" },
      { semi: 0, quality: "7" },
      { semi: 0, quality: "7" },
      { semi: 5, quality: "7" },
      { semi: 5, quality: "7" },
      { semi: 0, quality: "7" },
      { semi: 0, quality: "7" },
      { semi: 7, quality: "7" },
      { semi: 5, quality: "7" },
      { semi: 0, quality: "7" },
      { semi: 7, quality: "7" },
    ],
  },
];

/** プリセット → コードイベント列（startBeat から 1小節刻み） */
export const presetToChords = (
  preset: ProgressionPreset,
  keyRoot: number,
  startBeat: number
): Omit<ChordEvent, "id">[] =>
  preset.chords.map((c, i) => ({
    root: (keyRoot + c.semi) % 12,
    quality: c.quality,
    startBeat: startBeat + i * 4,
    durationBeats: 4,
  }));

/* ------------------------------------------------------------------ */
/* ボイシング                                                           */
/* ------------------------------------------------------------------ */

const PITCH_LO = 36;
const PITCH_HI = 84;

const clampPitches = (pitches: number[]): number[] =>
  pitches.map((p) => {
    let x = p;
    while (x < PITCH_LO) x += 12;
    while (x > PITCH_HI) x -= 12;
    return x;
  });

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * ピアノ用ボイシング。前のボイシングに平均音高が最も近い転回形を選ぶ
 * （ボイスリーディング：コードチェンジで手の移動が小さい）
 */
export const voiceChordPiano = (
  root: number,
  quality: ChordQuality,
  prev?: number[]
): number[] => {
  const base = 48 + (((root % 12) + 12) % 12); // C3 オクターブ
  const closed = CHORD_INTERVALS[quality].map((i) => base + i);
  if (!prev || prev.length === 0) return clampPitches(closed);

  // 転回形候補（各転回形と、その±1オクターブ）
  const rotations: number[][] = [closed];
  let current = [...closed];
  for (let inv = 1; inv < closed.length; inv++) {
    current = [...current.slice(1), current[0]! + 12].sort((a, b) => a - b);
    rotations.push([...current]);
  }
  const candidates: number[][] = rotations.flatMap((r) => [
    r,
    r.map((p) => p - 12),
    r.map((p) => p + 12),
  ]);

  const target = avg(prev);
  let best = candidates[0]!;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = Math.abs(avg(c) - target);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return clampPitches(best);
};

/**
 * ギター用ボイシング（ルート低音＋5度＋オクターブ＋3度系＋テンション）
 * 低音側から並べてストロークの時差再生に使う
 */
export const voiceChordGuitar = (root: number, quality: ChordQuality): number[] => {
  const pc = ((root % 12) + 12) % 12;
  // ルートを E2(40)〜D#3(51) に配置
  const r = 40 + ((pc - 4 + 12) % 12);
  const iv = CHORD_INTERVALS[quality];
  const third = iv[1] ?? 4;
  const fifth = iv[2] ?? 7;
  const out = [r, r + fifth, r + 12, r + 12 + third];
  if (iv.length >= 4) out.push(r + 12 + iv[3]!);
  return clampPitches(out).sort((a, b) => a - b);
};

/* ------------------------------------------------------------------ */
/* MIDI ノート生成                                                       */
/* ------------------------------------------------------------------ */

export type ChordPattern = "block" | "quarter" | "eighth" | "arp8";

export const CHORD_PATTERN_LABELS: Record<ChordPattern, string> = {
  block: "全音符（白玉）",
  quarter: "4分刻み",
  eighth: "8分ストローク",
  arp8: "アルペジオ",
};

export type ChordTarget = "piano" | "guitar";

/** ストロークの弦ごとの時差（拍） */
const STRUM_STEP = 0.02;

type NoteSeed = Omit<MidiNote, "id">;

const pushChordHit = (
  out: NoteSeed[],
  pitches: number[],
  start: number,
  duration: number,
  velocity: number,
  strum: "none" | "down" | "up"
) => {
  const ordered =
    strum === "up" ? [...pitches].sort((a, b) => b - a) : [...pitches].sort((a, b) => a - b);
  ordered.forEach((pitch, i) => {
    const offset = strum === "none" ? 0 : i * STRUM_STEP;
    const d = Math.max(0.1, duration - offset);
    out.push({ pitch, start: start + offset, duration: d, velocity });
  });
};

/** コード進行 → MIDI ノート列を生成 */
export const generateChordNotes = (
  chords: ChordEvent[],
  target: ChordTarget,
  pattern: ChordPattern
): NoteSeed[] => {
  const sorted = [...chords].sort((a, b) => a.startBeat - b.startBeat);
  const out: NoteSeed[] = [];
  let prevVoicing: number[] | undefined;

  for (const ch of sorted) {
    const pitches =
      target === "guitar"
        ? voiceChordGuitar(ch.root, ch.quality)
        : voiceChordPiano(ch.root, ch.quality, prevVoicing);
    prevVoicing = pitches;
    const strumHit = target === "guitar";
    const start = ch.startBeat;
    const dur = ch.durationBeats;

    if (pattern === "block") {
      pushChordHit(out, pitches, start, dur * 0.98, 96, strumHit ? "down" : "none");
    } else if (pattern === "quarter") {
      for (let b = 0; b < dur; b += 1) {
        const accent = b % 4 === 0 ? 100 : 88;
        pushChordHit(out, pitches, start + b, 0.92, accent, strumHit ? "down" : "none");
      }
    } else if (pattern === "eighth") {
      for (let b = 0; b < dur; b += 0.5) {
        const isDown = (b * 2) % 2 === 0;
        const accent = b % 2 === 0 ? 100 : isDown ? 88 : 76;
        pushChordHit(
          out,
          pitches,
          start + b,
          0.42,
          accent,
          strumHit ? (isDown ? "down" : "up") : "none"
        );
      }
    } else {
      // arp8: コードトーンを上昇で循環する8分アルペジオ
      const cycle = [...pitches].sort((a, b) => a - b);
      let idx = 0;
      for (let b = 0; b < dur; b += 0.5) {
        const pitch = cycle[idx % cycle.length]!;
        out.push({
          pitch,
          start: start + b,
          duration: 0.48,
          velocity: idx % cycle.length === 0 ? 100 : 84,
        });
        idx++;
      }
    }
  }
  return out;
};

/** 進行全体の終端拍 */
export const chordsEndBeat = (chords: ChordEvent[]): number =>
  chords.reduce((end, c) => Math.max(end, c.startBeat + c.durationBeats), 0);

/** 試聴用：コードの構成音（ピアノボイシング） */
export const chordPreviewPitches = (root: number, quality: ChordQuality): number[] =>
  voiceChordPiano(root, quality);
