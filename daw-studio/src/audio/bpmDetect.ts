/** オンセット包絡の自己相関による簡易 BPM 推定（60〜200 BPM） */

const HOP = 512;

const onsetEnvelope = (x: Float32Array): Float32Array => {
  const frames = Math.floor(x.length / HOP);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let i = f * HOP; i < (f + 1) * HOP; i++) s += x[i] * x[i];
    energy[f] = Math.log1p(1000 * Math.sqrt(s / HOP));
  }
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) flux[f] = Math.max(0, energy[f] - energy[f - 1]);
  let mean = 0;
  for (const v of flux) mean += v;
  mean /= Math.max(1, frames);
  for (let f = 0; f < frames; f++) flux[f] = Math.max(0, flux[f] - mean);
  return flux;
};

export type BpmEstimate = { bpm: number; confidence: number };

export const mixToMono = (channels: Float32Array[]): Float32Array => {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length;
  return out;
};

/** 推定不能（短すぎる・無音・拍が不明瞭）なら null */
export const detectBpm = (mono: Float32Array, sampleRate: number): BpmEstimate | null => {
  const env = onsetEnvelope(mono);
  const fps = sampleRate / HOP;
  if (env.length < fps * 4) return null;

  const minLag = Math.floor((fps * 60) / 200);
  const maxLag = Math.ceil((fps * 60) / 60);
  if (maxLag >= env.length / 2) return null;

  let zero = 0;
  for (let i = 0; i < env.length; i++) zero += env[i] * env[i];
  if (zero < 1e-6) return null;

  const acf = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < env.length; i++) s += env[i] * env[i + lag];
    acf[lag] = s / (env.length - lag);
  }

  // 人間が取りやすい 90〜180 BPM 付近を僅かに優遇（倍・半分テンポの取り違え対策）
  const prior = (bpm: number) => 1 - 0.15 * Math.abs(Math.log2(bpm / 120));

  let bestLag = -1;
  let bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (acf[lag] < acf[lag - 1] || acf[lag] < acf[lag + 1]) continue;
    const bpm = (60 * fps) / lag;
    // 2 倍周期の相関も支える候補を優先
    const harmonic = acf[Math.min(lag * 2, acf.length - 1)] ?? 0;
    const score = (acf[lag] + 0.5 * harmonic) * prior(bpm);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag < 0) return null;

  // 放物線補間でサブフレーム精度に
  const a = acf[bestLag - 1], b = acf[bestLag], c = acf[bestLag + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  const lag = bestLag + Math.max(-0.5, Math.min(0.5, shift));
  const bpm = (60 * fps) / lag;
  const confidence = Math.max(0, Math.min(1, b / (zero / env.length)));
  return { bpm: Math.round(bpm * 10) / 10, confidence };
};
