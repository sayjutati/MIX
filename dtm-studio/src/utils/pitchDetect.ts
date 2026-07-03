/**
 * モノフォニック音声のピッチ検出（YIN アルゴリズム）
 * 参照: de Cheveigné & Kawahara (2002) "YIN, a fundamental frequency estimator"
 */

export type PitchFrame = {
  timeSec: number;
  /** 基本周波数 Hz（無声 = 0） */
  freq: number;
  /** 検出の明瞭度 0〜1（1 = 完全な周期性） */
  clarity: number;
  rms: number;
};

export const freqToMidiFloat = (freq: number) => 69 + 12 * Math.log2(freq / 440);
export const midiFloatToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export type YinOptions = {
  minFreq?: number;
  maxFreq?: number;
  threshold?: number;
};

/**
 * 1フレームの基本周波数を YIN（CMND + 放物線補間）で推定。
 * 検出できない場合は freq = 0。
 */
export function detectPitchYin(
  frame: Float32Array,
  sampleRate: number,
  opts: YinOptions = {}
): { freq: number; clarity: number } {
  const minFreq = opts.minFreq ?? 60;
  const maxFreq = opts.maxFreq ?? 1200;
  const threshold = opts.threshold ?? 0.12;

  const maxLag = Math.min(Math.floor(sampleRate / minFreq), Math.floor(frame.length / 2));
  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  if (maxLag <= minLag) return { freq: 0, clarity: 0 };

  const w = frame.length - maxLag;
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let sum = 0;
    for (let i = 0; i < w; i++) {
      const diff = frame[i]! - frame[i + tau]!;
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // 累積平均正規化差分（CMND）
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    running += d[tau]!;
    cmnd[tau] = running > 0 ? (d[tau]! * tau) / running : 1;
  }

  // しきい値を最初に下回る谷を探し、その局所最小まで下る
  let tauEst = -1;
  for (let tau = minLag; tau <= maxLag; tau++) {
    if (cmnd[tau]! < threshold) {
      while (tau + 1 <= maxLag && cmnd[tau + 1]! < cmnd[tau]!) tau++;
      tauEst = tau;
      break;
    }
  }
  // しきい値未達なら全域の最小値を候補にする（明瞭度は下がる）
  if (tauEst < 0) {
    let best = minLag;
    for (let tau = minLag + 1; tau <= maxLag; tau++) {
      if (cmnd[tau]! < cmnd[best]!) best = tau;
    }
    if (cmnd[best]! > 0.5) return { freq: 0, clarity: 0 };
    tauEst = best;
  }

  // 放物線補間でサブサンプル精度に
  let tauRefined = tauEst;
  if (tauEst > minLag && tauEst < maxLag) {
    const y0 = cmnd[tauEst - 1]!;
    const y1 = cmnd[tauEst]!;
    const y2 = cmnd[tauEst + 1]!;
    const denom = y0 - 2 * y1 + y2;
    if (Math.abs(denom) > 1e-12) {
      tauRefined = tauEst + (y0 - y2) / (2 * denom) / 1;
    }
  }

  const freq = sampleRate / tauRefined;
  if (freq < minFreq || freq > maxFreq) return { freq: 0, clarity: 0 };
  return { freq, clarity: Math.max(0, Math.min(1, 1 - cmnd[tauEst]!)) };
}

export type AnalyzeOptions = YinOptions & {
  frameSize?: number;
  hopSize?: number;
};

/** サンプル列全体をフレーム解析してピッチトラックを返す */
export function analyzePitch(
  samples: Float32Array,
  sampleRate: number,
  opts: AnalyzeOptions = {}
): PitchFrame[] {
  const frameSize = opts.frameSize ?? 2048;
  const hopSize = opts.hopSize ?? 256;
  const frames: PitchFrame[] = [];
  if (samples.length < frameSize) return frames;

  const buf = new Float32Array(frameSize);
  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    buf.set(samples.subarray(start, start + frameSize));
    let sq = 0;
    for (let i = 0; i < frameSize; i++) sq += buf[i]! * buf[i]!;
    const rms = Math.sqrt(sq / frameSize);
    const timeSec = start / sampleRate;

    if (rms < 1e-4) {
      frames.push({ timeSec, freq: 0, clarity: 0, rms });
      continue;
    }
    const { freq, clarity } = detectPitchYin(buf, sampleRate, opts);
    frames.push({ timeSec, freq, clarity, rms });
  }
  return frames;
}
