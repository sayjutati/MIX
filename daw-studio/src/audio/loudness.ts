/** ITU-R BS.1770-4 / EBU R128 の統合ラウドネス（LUFS）。YouTube は約 -14 LUFS を基準に音量調整する */

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

const kWeightingFilters = (fs: number): [Biquad, Biquad] => {
  // 高域シェルフ（頭部の回折）
  const G = 3.999843853973347;
  const f0s = 1681.9744509555319;
  const Qs = 0.7071752369554196;
  const Ks = Math.tan((Math.PI * f0s) / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.499666774155);
  const a0s = 1 + Ks / Qs + Ks * Ks;
  const shelf: Biquad = {
    b0: (Vh + (Vb * Ks) / Qs + Ks * Ks) / a0s,
    b1: (2 * (Ks * Ks - Vh)) / a0s,
    b2: (Vh - (Vb * Ks) / Qs + Ks * Ks) / a0s,
    a1: (2 * (Ks * Ks - 1)) / a0s,
    a2: (1 - Ks / Qs + Ks * Ks) / a0s,
  };

  // RLB ハイパス
  const f0h = 38.13547087613982;
  const Qh = 0.5003270373253953;
  const Kh = Math.tan((Math.PI * f0h) / fs);
  const a0h = 1 + Kh / Qh + Kh * Kh;
  const hp: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (Kh * Kh - 1)) / a0h,
    a2: (1 - Kh / Qh + Kh * Kh) / a0h,
  };
  return [shelf, hp];
};

const applyBiquad = (x: Float32Array, c: Biquad): Float64Array => {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
};

const kWeight = (x: Float32Array, fs: number): Float64Array => {
  const [shelf, hp] = kWeightingFilters(fs);
  const a = applyBiquad(x, shelf);
  const out = new Float64Array(a.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < a.length; i++) {
    const v = hp.b0 * a[i] + hp.b1 * x1 + hp.b2 * x2 - hp.a1 * y1 - hp.a2 * y2;
    x2 = x1; x1 = a[i]; y2 = y1; y1 = v;
    out[i] = v;
  }
  return out;
};

const toLufs = (meanSquareSum: number) => -0.691 + 10 * Math.log10(meanSquareSum);

/** 統合ラウドネス（LUFS）。無音・400ms 未満は -Infinity */
export const integratedLoudness = (channels: Float32Array[], sampleRate: number): number => {
  if (channels.length === 0) return -Infinity;
  const weighted = channels.slice(0, 2).map((c) => kWeight(c, sampleRate));
  const len = weighted[0].length;
  const block = Math.round(0.4 * sampleRate);
  const step = Math.round(0.1 * sampleRate);
  if (len < block) return -Infinity;

  // 各チャンネルの二乗の累積和で、ブロック毎の平均二乗を O(1) で求める
  const prefix = weighted.map((w) => {
    const p = new Float64Array(len + 1);
    for (let i = 0; i < len; i++) p[i + 1] = p[i] + w[i] * w[i];
    return p;
  });

  const energies: number[] = [];
  for (let start = 0; start + block <= len; start += step) {
    let sum = 0;
    for (const p of prefix) sum += (p[start + block] - p[start]) / block;
    energies.push(sum);
  }

  const absGated = energies.filter((e) => e > 0 && toLufs(e) > -70);
  if (absGated.length === 0) return -Infinity;
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const relThreshold = toLufs(mean(absGated)) - 10;
  const relGated = absGated.filter((e) => toLufs(e) > relThreshold);
  if (relGated.length === 0) return -Infinity;
  return toLufs(mean(relGated));
};

export const bufferLoudness = (buffer: AudioBuffer): number => {
  const chans: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) chans.push(buffer.getChannelData(c));
  return integratedLoudness(chans, buffer.sampleRate);
};

export const samplePeak = (channels: Float32Array[]): number => {
  let peak = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const v = Math.abs(ch[i]);
      if (v > peak) peak = v;
    }
  }
  return peak;
};

export type LoudnessResult = {
  before: number;
  after: number;
  gainDb: number;
  /** ピーク保護のためにゲインを抑えた */
  peakLimited: boolean;
};

/**
 * ラウドネスを target LUFS に合わせる（破壊的に data を書き換える）。
 * クリップを避けるため、ピークが ceilingDb を超えるほどの増幅はしない。
 */
export const normalizeLoudness = (
  channels: Float32Array[],
  sampleRate: number,
  targetLufs = -14,
  ceilingDb = -1
): LoudnessResult => {
  const before = integratedLoudness(channels, sampleRate);
  if (!Number.isFinite(before)) return { before, after: before, gainDb: 0, peakLimited: false };

  let gainDb = targetLufs - before;
  const peak = samplePeak(channels);
  let peakLimited = false;
  if (peak > 0) {
    const maxGainDb = ceilingDb - 20 * Math.log10(peak);
    if (gainDb > maxGainDb) {
      gainDb = maxGainDb;
      peakLimited = true;
    }
  }
  const g = Math.pow(10, gainDb / 20);
  for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= g;
  return { before, after: before + gainDb, gainDb, peakLimited };
};
