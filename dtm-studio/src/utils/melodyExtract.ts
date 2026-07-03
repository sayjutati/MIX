/**
 * ピッチトラック（f0 フレーム列）→ MIDI ノート列への変換（メロディ採譜）
 */
import { freqToMidiFloat, type PitchFrame } from "./pitchDetect";

export type ExtractedNote = {
  pitch: number;
  /** 拍位置 */
  start: number;
  /** 拍長 */
  duration: number;
  velocity: number;
};

export type ExtractOptions = {
  tempo: number;
  /** クオンタイズグリッド（拍）。0 = なし */
  quantGrid?: number;
  /** これより短いノートは破棄（拍） */
  minNoteBeats?: number;
  /** RMS ゲート（ピーク比） */
  rmsGateRatio?: number;
  /** YIN 明瞭度の下限 */
  clarityMin?: number;
};

type Segment = {
  startSec: number;
  endSec: number;
  midis: number[];
  rmsSum: number;
  count: number;
};

const median = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** 奇数窓のメディアンフィルタ（有声フレームのみ対象、無声は 0 のまま） */
const medianFilterVoiced = (midis: Float64Array, win = 5): Float64Array => {
  const half = Math.floor(win / 2);
  const out = new Float64Array(midis.length);
  for (let i = 0; i < midis.length; i++) {
    if (midis[i] === 0) continue;
    const neigh: number[] = [];
    for (let j = Math.max(0, i - half); j <= Math.min(midis.length - 1, i + half); j++) {
      if (midis[j] !== 0) neigh.push(midis[j]!);
    }
    out[i] = median(neigh);
  }
  return out;
};

/**
 * ピッチトラックからノート列を抽出する。
 * 手順: 有声ゲート → メディアン平滑 → 半音単位セグメント化 → 拍変換・クオンタイズ
 */
export function extractMelodyNotes(frames: PitchFrame[], opts: ExtractOptions): ExtractedNote[] {
  if (frames.length === 0) return [];
  const quantGrid = opts.quantGrid ?? 0;
  const minNoteBeats = opts.minNoteBeats ?? 0.2;
  const rmsGateRatio = opts.rmsGateRatio ?? 0.06;
  const clarityMin = opts.clarityMin ?? 0.45;
  const secToBeat = (sec: number) => (sec * opts.tempo) / 60;

  let peakRms = 0;
  for (const f of frames) peakRms = Math.max(peakRms, f.rms);
  if (peakRms < 1e-5) return [];
  const gate = Math.max(0.004, peakRms * rmsGateRatio);

  // 有声フレームの MIDI 値（無声 = 0）
  const midis = new Float64Array(frames.length);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]!;
    if (f.freq > 0 && f.clarity >= clarityMin && f.rms >= gate) {
      midis[i] = freqToMidiFloat(f.freq);
    }
  }
  const smooth = medianFilterVoiced(midis, 5);

  const hopSec =
    frames.length > 1 ? frames[1]!.timeSec - frames[0]!.timeSec : 0.01;
  // これ以上の無声ギャップでノートを切る（約 80ms）
  const maxGapFrames = Math.max(2, Math.round(0.08 / hopSec));
  // ピッチ変化がこのフレーム数続いたら別ノートに分割
  const pitchChangeFrames = 3;

  const segments: Segment[] = [];
  let cur: Segment | null = null;
  let gapCount = 0;
  let changeCount = 0;

  const closeSegment = () => {
    if (cur && cur.count >= 2) segments.push(cur);
    cur = null;
    changeCount = 0;
  };

  for (let i = 0; i < frames.length; i++) {
    const m = smooth[i]!;
    const f = frames[i]!;
    if (m === 0) {
      gapCount++;
      if (cur && gapCount > maxGapFrames) closeSegment();
      continue;
    }
    gapCount = 0;

    if (!cur) {
      cur = { startSec: f.timeSec, endSec: f.timeSec + hopSec, midis: [m], rmsSum: f.rms, count: 1 };
      continue;
    }

    const curPitch = median(cur.midis);
    if (Math.abs(m - curPitch) > 0.65) {
      changeCount++;
      if (changeCount >= pitchChangeFrames) {
        // 分割: 変化開始フレームまでで閉じ、新ノートを開く
        closeSegment();
        cur = { startSec: f.timeSec, endSec: f.timeSec + hopSec, midis: [m], rmsSum: f.rms, count: 1 };
        continue;
      }
    } else {
      changeCount = 0;
    }
    cur.midis.push(m);
    cur.rmsSum += f.rms;
    cur.count++;
    cur.endSec = f.timeSec + hopSec;
  }
  closeSegment();

  // セグメント → ノート
  const notes: ExtractedNote[] = [];
  for (const seg of segments) {
    const pitch = Math.round(median(seg.midis));
    if (pitch < 24 || pitch > 108) continue;
    let start = secToBeat(seg.startSec);
    let end = secToBeat(seg.endSec);
    if (quantGrid > 0) {
      start = Math.round(start / quantGrid) * quantGrid;
      end = Math.round(end / quantGrid) * quantGrid;
      if (end <= start) end = start + quantGrid;
    }
    const duration = end - start;
    if (duration < minNoteBeats) continue;
    const meanRms = seg.rmsSum / seg.count;
    const velocity = Math.max(
      30,
      Math.min(120, Math.round(40 + 80 * Math.sqrt(meanRms / peakRms)))
    );
    notes.push({ pitch, start: Math.max(0, start), duration, velocity });
  }

  // 同ピッチで隣接するノートをマージ（クオンタイズで接触した場合）
  notes.sort((a, b) => a.start - b.start);
  const merged: ExtractedNote[] = [];
  for (const n of notes) {
    const prev = merged[merged.length - 1];
    if (prev && prev.pitch === n.pitch && n.start - (prev.start + prev.duration) < 0.05) {
      prev.duration = n.start + n.duration - prev.start;
      prev.velocity = Math.max(prev.velocity, n.velocity);
    } else {
      merged.push({ ...n });
    }
  }
  return merged;
}

/**
 * 録音全体の代表音高（RMS 重み付きメディアン）を MIDI float で返す。
 * サンプラーのルート音推定用。無声のみなら null。
 */
export function estimateRootPitch(frames: PitchFrame[]): number | null {
  const entries: { midi: number; w: number }[] = [];
  for (const f of frames) {
    if (f.freq > 0 && f.clarity >= 0.45) {
      entries.push({ midi: freqToMidiFloat(f.freq), w: f.rms });
    }
  }
  if (entries.length === 0) return null;
  entries.sort((a, b) => a.midi - b.midi);
  const total = entries.reduce((s, e) => s + e.w, 0);
  let acc = 0;
  for (const e of entries) {
    acc += e.w;
    if (acc >= total / 2) return e.midi;
  }
  return entries[entries.length - 1]!.midi;
}
