import type { PitchNote } from "../types";

/* =========================================================================
 * ピッチ検出（自己相関）＋ノート分割、およびグラニュラー・ピッチシフト。
 * 依存追加なし。録音品質を保つため、補正量は呼び出し側で ±limit にクランプする。
 * ========================================================================= */

export const freqToMidi = (f: number) => 69 + 12 * Math.log2(f / 440);
export const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const midiToName = (m: number) => {
  const r = Math.round(m);
  return `${NOTE_NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`;
};

/** マルチチャンネルをモノラルに合成 */
const toMono = (buffer: AudioBuffer): Float32Array => {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += d[i];
  }
  if (ch > 1) for (let i = 0; i < len; i++) out[i] /= ch;
  return out;
};

/** 単純平均によるダウンサンプル（ピッチ検出を高速化） */
const downsample = (data: Float32Array, srcRate: number, dstRate: number): Float32Array => {
  if (dstRate >= srcRate) return data;
  const ratio = srcRate / dstRate;
  const n = Math.floor(data.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = start; j < end && j < data.length; j++) s += data[j];
    out[i] = s / (end - start);
  }
  return out;
};

const DETECT_RATE = 16000;
const MIN_F0 = 75; // Hz（低めの男声まで）
const MAX_F0 = 1000; // Hz（高めの女声・裏声）
const CLARITY_THRESHOLD = 0.62;
const MIN_NOTE_SEC = 0.09;

/** 1フレームの基本周波数を自己相関で推定 */
const detectFrameF0 = (
  frame: Float32Array,
  sr: number
): { f0: number; clarity: number; rms: number } => {
  const N = frame.length;
  let rms = 0;
  for (let i = 0; i < N; i++) rms += frame[i] * frame[i];
  const energy = rms;
  rms = Math.sqrt(rms / N);
  if (rms < 0.012) return { f0: 0, clarity: 0, rms };

  const minLag = Math.floor(sr / MAX_F0);
  const maxLag = Math.min(N - 1, Math.floor(sr / MIN_F0));

  let bestLag = -1;
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < N - lag; i++) s += frame[i] * frame[i + lag];
    const norm = s / (energy || 1);
    if (norm > best) {
      best = norm;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || best < CLARITY_THRESHOLD) return { f0: 0, clarity: best, rms };

  // 放物線補間でラグを微調整
  let lagRefined = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const corrAt = (lag: number) => {
      let s = 0;
      for (let i = 0; i < N - lag; i++) s += frame[i] * frame[i + lag];
      return s;
    };
    const y0 = corrAt(bestLag - 1);
    const y1 = corrAt(bestLag);
    const y2 = corrAt(bestLag + 1);
    const denom = y0 - 2 * y1 + y2;
    if (Math.abs(denom) > 1e-9) lagRefined = bestLag + (0.5 * (y0 - y2)) / denom;
  }

  return { f0: sr / lagRefined, clarity: best, rms };
};

/** 中央値（小さい配列用） */
const median = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

let noteSeq = 0;
const nextNoteId = () => Date.now() * 1000 + (noteSeq++ % 1000);

/**
 * 録音バッファを解析し、音程の安定区間を「ノート」として分割する。
 * 返り値の start/end はクリップ内ローカル秒。
 */
export const detectNotes = (buffer: AudioBuffer): PitchNote[] => {
  const mono = toMono(buffer);
  const ds = downsample(mono, buffer.sampleRate, DETECT_RATE);
  const sr = Math.min(DETECT_RATE, buffer.sampleRate);

  const frameSize = Math.round(sr * 0.06); // 60ms
  const hop = Math.round(sr * 0.012); // 12ms
  const frame = new Float32Array(frameSize);

  type FrameInfo = { t: number; midi: number; voiced: boolean };
  const frames: FrameInfo[] = [];

  for (let pos = 0; pos + frameSize <= ds.length; pos += hop) {
    for (let i = 0; i < frameSize; i++) frame[i] = ds[pos + i];
    const { f0 } = detectFrameF0(frame, sr);
    const t = (pos + frameSize / 2) / sr;
    if (f0 >= MIN_F0 && f0 <= MAX_F0) {
      frames.push({ t, midi: freqToMidi(f0), voiced: true });
    } else {
      frames.push({ t, midi: 0, voiced: false });
    }
  }

  // 中央値スムージング（オクターブ飛びを抑える）
  const win = 2;
  const smoothed = frames.map((f, i) => {
    if (!f.voiced) return f;
    const around: number[] = [];
    for (let k = -win; k <= win; k++) {
      const g = frames[i + k];
      if (g && g.voiced) around.push(g.midi);
    }
    return { ...f, midi: median(around) || f.midi };
  });

  // 連続する有声フレームを、四捨五入半音が一致する区間でまとめる
  const notes: PitchNote[] = [];
  let i = 0;
  while (i < smoothed.length) {
    if (!smoothed[i].voiced) {
      i++;
      continue;
    }
    const startT = smoothed[i].t;
    const semis = Math.round(smoothed[i].midi);
    const collected: number[] = [smoothed[i].midi];
    let endT = smoothed[i].t;
    let gap = 0;
    let j = i + 1;
    for (; j < smoothed.length; j++) {
      const fr = smoothed[j];
      const sameNote = fr.voiced && Math.round(fr.midi) === semis;
      if (sameNote) {
        collected.push(fr.midi);
        endT = fr.t;
        gap = 0;
      } else {
        gap++;
        if (gap > 3) break; // 約36msの揺れは許容
      }
    }
    if (endT - startT >= MIN_NOTE_SEC) {
      notes.push({
        id: nextNoteId(),
        start: Math.max(0, startT - 0.02),
        end: endT + 0.02,
        midi: median(collected),
        shift: 0,
      });
    }
    i = j;
  }

  return notes;
};

/* ---- グラニュラー・ピッチシフト（時間長を保持） ---- */

const hannWindow = (n: number): Float32Array => {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
};

/**
 * input の絶対サンプル [startAbs, startAbs+regionLen) を ratio 倍にピッチシフトし、
 * 時間長を保ったまま region を返す（オーバーラップ加算）。
 */
const granularShiftRegion = (
  input: Float32Array,
  startAbs: number,
  regionLen: number,
  ratio: number,
  win: Float32Array,
  hop: number
): Float32Array => {
  const N = win.length;
  const out = new Float32Array(regionLen);
  const norm = new Float32Array(regionLen);

  for (let pos = 0; pos < regionLen; pos += hop) {
    for (let j = 0; j < N; j++) {
      const outIdx = pos + j;
      if (outIdx >= regionLen) break;
      const srcF = startAbs + pos + j * ratio;
      const i0 = Math.floor(srcF);
      const frac = srcF - i0;
      const a = i0 >= 0 && i0 < input.length ? input[i0] : 0;
      const b = i0 + 1 >= 0 && i0 + 1 < input.length ? input[i0 + 1] : 0;
      const sample = a + (b - a) * frac;
      const w = win[j];
      out[outIdx] += sample * w;
      norm[outIdx] += w;
    }
  }
  for (let i = 0; i < regionLen; i++) {
    if (norm[i] > 1e-6) out[i] /= norm[i];
  }
  return out;
};

/**
 * notes の shift に従って各セグメントをピッチシフトした新しい AudioBuffer を返す。
 * 元バッファは変更しない（非破壊）。境界はクロスフェードしてクリックを防ぐ。
 */
export const renderPitchCorrected = (
  buffer: AudioBuffer,
  notes: PitchNote[],
  limit: number
): AudioBuffer => {
  const sr = buffer.sampleRate;
  const out = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: sr,
  });

  const N = 1024;
  const win = hannWindow(N);
  const hop = N / 4;
  const fadeLen = Math.min(Math.round(sr * 0.006), 256);

  const active = notes
    .map((n) => ({
      ...n,
      shift: Math.max(-limit, Math.min(limit, Math.round(n.shift))),
    }))
    .filter((n) => n.shift !== 0 && n.end > n.start);

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const input = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(input); // まず原音をコピー

    for (const note of active) {
      const startSample = Math.max(0, Math.floor(note.start * sr));
      const endSample = Math.min(buffer.length, Math.ceil(note.end * sr));
      const regionLen = endSample - startSample;
      if (regionLen < N) continue;

      const ratio = Math.pow(2, note.shift / 12);
      const region = granularShiftRegion(input, startSample, regionLen, ratio, win, hop);

      // 境界クロスフェード
      const fl = Math.min(fadeLen, Math.floor(regionLen / 2));
      for (let i = 0; i < fl; i++) {
        const w = i / fl;
        region[i] = input[startSample + i] * (1 - w) + region[i] * w;
        const k = regionLen - 1 - i;
        region[k] = input[startSample + k] * (1 - w) + region[k] * w;
      }

      dst.set(region, startSample);
    }
  }

  return out;
};

/**
 * バッファ全体を semitones 半音シフトした新しい AudioBuffer を返す（時間長は保持）。
 * ハモリ生成などに使用。
 */
export const renderWholeShift = (buffer: AudioBuffer, semitones: number): AudioBuffer => {
  const out = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  if (semitones === 0) {
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      out.getChannelData(c).set(buffer.getChannelData(c));
    }
    return out;
  }
  const N = 1024;
  const win = hannWindow(N);
  const hop = N / 4;
  const ratio = Math.pow(2, semitones / 12);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const input = buffer.getChannelData(c);
    const region = granularShiftRegion(input, 0, buffer.length, ratio, win, hop);
    out.getChannelData(c).set(region);
  }
  return out;
};
