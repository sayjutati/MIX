/** オシレーター・ミックス処理（リアルタイム / オフライン共通） */

export type OscWaveform = "sine" | "saw" | "square" | "noise";

export type DrumKind = "kick" | "snare" | "hat" | "tom" | "cymbal" | "noise";

const TAU = 2 * Math.PI;

/** PolyBLEP 補正（Naive 波の折り返しエイリアスを低減） */
export const polyBlep = (t: number, dt: number): number => {
  if (dt <= 0) return 0;
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
};

export const bandLimitedSaw = (phase: number, phaseInc: number): number => {
  const t = (phase % TAU) / TAU;
  const dt = phaseInc / TAU;
  let s = 2 * t - 1;
  s -= polyBlep(t, dt);
  return s;
};

export const bandLimitedSquare = (phase: number, phaseInc: number): number => {
  const t = (phase % TAU) / TAU;
  const dt = phaseInc / TAU;
  let s = t < 0.5 ? 1 : -1;
  s += polyBlep(t, dt);
  s -= polyBlep((t + 0.5) % 1, dt);
  return s;
};

export const nextNoise = (seed: { v: number }): number => {
  seed.v = (seed.v * 1664525 + 1013904223) | 0;
  return (seed.v >>> 0) / 0x7fffffff - 1;
};

export const onePoleLP = (state: { v: number }, input: number, cutoffHz: number, sampleRate: number) => {
  const alpha = 1 - Math.exp((-TAU * cutoffHz) / sampleRate);
  state.v += alpha * (input - state.v);
  return state.v;
};

export const onePoleHP = (state: { v: number }, input: number, cutoffHz: number, sampleRate: number) => {
  const lp = { v: state.v };
  const y = onePoleLP(lp, input, cutoffHz, sampleRate);
  state.v = lp.v;
  return input - y;
};

export const softClip = (x: number): number => {
  const t = Math.tanh(x * 1.4);
  return t * 0.95;
};

export const velocityGain = (velocity: number): number => {
  const n = Math.max(0, Math.min(127, velocity)) / 127;
  return Math.pow(n, 0.72);
};

export const midiToFreq = (pitch: number) => 440 * Math.pow(2, (pitch - 69) / 12);

export const kickFreqAt = (startSec: number, nowSec: number): number => {
  const t = Math.max(0, nowSec - startSec);
  const startHz = 148;
  const endHz = 52;
  const env = Math.exp(-t / 0.028);
  return endHz + (startHz - endHz) * env;
};

export type OscSampleOpts = {
  waveform: OscWaveform;
  phase: number;
  phaseInc: number;
  noiseSeed: { v: number };
  lpState?: { v: number };
  hpState?: { v: number };
  drumKind?: DrumKind;
  voiceStartSec?: number;
  nowSec?: number;
  sampleRate?: number;
};

export const oscSampleAdv = (opts: OscSampleOpts): number => {
  const {
    waveform,
    phase,
    phaseInc,
    noiseSeed,
    lpState,
    hpState,
    drumKind,
    voiceStartSec = 0,
    nowSec = 0,
    sampleRate = 44100,
  } = opts;

  if (drumKind === "kick") {
    const p = phase % TAU;
    return Math.sin(p) * (1 - Math.min(1, (nowSec - voiceStartSec) / 0.004) * 0.15);
  }

  if (drumKind === "snare") {
    const tone = Math.sin(phase) * 0.38;
    const raw = nextNoise(noiseSeed);
    const lp = lpState ?? { v: 0 };
    const filtered = onePoleLP(lp, raw, 3200, sampleRate);
    if (lpState) lpState.v = lp.v;
    return tone + filtered * 0.62;
  }

  if (drumKind === "hat") {
    const raw = nextNoise(noiseSeed);
    const hp = hpState ?? { v: 0 };
    const filtered = onePoleHP(hp, raw, 6800, sampleRate);
    if (hpState) hpState.v = hp.v;
    return filtered * 0.85;
  }

  if (drumKind === "cymbal") {
    const raw = nextNoise(noiseSeed);
    const lp = lpState ?? { v: 0 };
    const filtered = onePoleLP(lp, raw, 9000, sampleRate);
    if (lpState) lpState.v = lp.v;
    return filtered * 0.9;
  }

  if (drumKind === "tom") {
    const t = Math.max(0, nowSec - voiceStartSec);
    const env = Math.exp(-t / 0.09);
    return Math.sin(phase) * (0.85 + env * 0.15);
  }

  if (waveform === "noise") {
    const raw = nextNoise(noiseSeed);
    const lp = lpState ?? { v: 0 };
    const filtered = onePoleLP(lp, raw, 4200, sampleRate);
    if (lpState) lpState.v = lp.v;
    return filtered;
  }

  if (waveform === "sine") return Math.sin(phase % TAU);
  if (waveform === "square") return bandLimitedSquare(phase, phaseInc);
  return bandLimitedSaw(phase, phaseInc);
};

/** マスター出力用：ステレオ LP + ソフトクリップ */
export const MASTER_OUTPUT_GAIN = 0.42;
export const MASTER_LP_HZ = 11800;

export const processMasterSample = (
  l: number,
  r: number,
  lpL: { v: number },
  lpR: { v: number },
  sampleRate: number
): { l: number; r: number } => {
  let ml = onePoleLP(lpL, l * MASTER_OUTPUT_GAIN, MASTER_LP_HZ, sampleRate);
  let mr = onePoleLP(lpR, r * MASTER_OUTPUT_GAIN, MASTER_LP_HZ, sampleRate);
  return { l: softClip(ml), r: softClip(mr) };
};
