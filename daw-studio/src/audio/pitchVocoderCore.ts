import type { PitchNote } from "../types";

/** 試聴・書き出し共通 — フォルマント保持位相ボコーダー */
export const VOCODER_FFT_SIZE = 2048;
export const VOCODER_HOP = 256;
export const VOCODER_LATENCY = VOCODER_FFT_SIZE - VOCODER_HOP;
/** ノート境界のクロスフェード（秒） */
export const NOTE_BLEND_SEC = 0.06;
/** シフト量のスムージング（秒）— 音のつながりを滑らかに */
export const SHIFT_SLEW_SEC = 0.045;

const TWO_PI = Math.PI * 2;

const hann = (n: number, i: number) =>
  0.5 - 0.5 * Math.cos((TWO_PI * i) / (n - 1));

const princarg = (p: number) => {
  while (p <= -Math.PI) p += TWO_PI;
  while (p > Math.PI) p -= TWO_PI;
  return p;
};

const fft = (re: Float32Array, im: Float32Array) => {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-TWO_PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * wRe - im[i + k + len / 2] * wIm;
        const vIm = re[i + k + len / 2] * wIm + im[i + k + len / 2] * wRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nwRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nwRe;
      }
    }
  }
};

const ifft = (re: Float32Array, im: Float32Array) => {
  for (let i = 0; i < im.length; i++) im[i] = -im[i];
  fft(re, im);
  const n = re.length;
  for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] = -im[i] / n;
  }
};

const spectralEnvelope = (mag: Float32Array, half: number, radius: number): Float32Array => {
  const env = new Float32Array(half);
  for (let k = 0; k < half; k++) {
    let sum = 0;
    let w = 0;
    for (let d = -radius; d <= radius; d++) {
      const idx = k + d;
      if (idx < 0 || idx >= half) continue;
      const wt = 1 / (1 + Math.abs(d));
      sum += mag[idx] * wt;
      w += wt;
    }
    env[k] = w > 0 ? sum / w : mag[k];
  }
  return env;
};

/**
 * 全ノートを重み付け合成 — 複数ノート・境界でも滑らかにブレンド
 */
export const shiftAtNotes = (
  notes: PitchNote[],
  timeSec: number,
  limit: number,
  blendSec = NOTE_BLEND_SEC
): number => {
  let weighted = 0;
  let totalW = 0;

  for (const n of notes) {
    const raw = Math.max(-limit, Math.min(limit, Math.round(n.shift)));
    if (Math.abs(raw) < 0.001) continue;

    const a = n.start - blendSec;
    const b = n.end + blendSec;
    if (timeSec < a || timeSec > b) continue;

    let w = 1;
    if (timeSec < n.start) w = (timeSec - a) / blendSec;
    else if (timeSec > n.end) w = (b - timeSec) / blendSec;
    w = Math.max(0, Math.min(1, w));
    if (w <= 0) continue;

    weighted += raw * w;
    totalW += w;
  }

  return totalW > 1e-6 ? weighted / totalW : 0;
};

export class PitchVocoderStream {
  private readonly win: Float32Array;
  private readonly frameRe: Float32Array;
  private readonly frameIm: Float32Array;
  private readonly outMag: Float32Array;
  private readonly outRe: Float32Array;
  private readonly outIm: Float32Array;
  private readonly prevPhase: Float32Array;
  private readonly synthPhase: Float32Array;
  private readonly fifo: Float32Array;
  private readonly ola: Float32Array;
  private readonly dryRing: Float32Array;
  private fifoLen = 0;
  private olaWrite = 0;
  private olaRead = 0;
  private dryPos = 0;
  private samplePos = 0;
  private speed = 1;
  private smoothShift = 0;
  private shiftFn: ((sec: number) => number) | null = null;
  private readonly slewAlpha: number;

  constructor(private readonly sampleRate: number) {
    const n = VOCODER_FFT_SIZE;
    const half = n / 2;
    this.win = new Float32Array(n);
    for (let i = 0; i < n; i++) this.win[i] = hann(n, i);
    this.frameRe = new Float32Array(n);
    this.frameIm = new Float32Array(n);
    this.outMag = new Float32Array(half);
    this.outRe = new Float32Array(n);
    this.outIm = new Float32Array(n);
    this.prevPhase = new Float32Array(half);
    this.synthPhase = new Float32Array(half);
    this.fifo = new Float32Array(n * 8);
    this.ola = new Float32Array(n * 16);
    this.dryRing = new Float32Array(VOCODER_LATENCY + 4);
    this.slewAlpha = 1 - Math.exp(-1 / (sampleRate * SHIFT_SLEW_SEC));
  }

  reset(localSample = 0) {
    this.fifoLen = 0;
    this.olaWrite = 0;
    this.olaRead = 0;
    this.dryPos = 0;
    this.ola.fill(0);
    this.dryRing.fill(0);
    this.prevPhase.fill(0);
    this.synthPhase.fill(0);
    this.smoothShift = 0;
    this.samplePos = localSample;
    this.shiftFn = null;
  }

  processBlock(
    input: Float32Array,
    output: Float32Array,
    shiftAt: (timeSec: number) => number,
    startMaterialSample: number,
    speed = 1
  ) {
    this.shiftFn = shiftAt;
    this.speed = speed;
    for (let i = 0; i < input.length; i++) {
      this.samplePos = startMaterialSample + i * speed;
      const sec = this.samplePos / this.sampleRate / speed;
      output[i] = this.pushSample(input[i], shiftAt(sec));
    }
  }

  private timelineSec() {
    return this.samplePos / this.sampleRate / this.speed;
  }

  private pushSample(input: number, targetShift: number): number {
    this.dryRing[this.dryPos % this.dryRing.length] = input;
    this.dryPos++;

    this.smoothShift += (targetShift - this.smoothShift) * this.slewAlpha;

    const dryDelayed =
      this.dryRing[(this.dryPos - VOCODER_LATENCY + this.dryRing.length) % this.dryRing.length] ??
      input;

    if (Math.abs(this.smoothShift) < 0.001) {
      this.trimFifo();
      return dryDelayed;
    }

    this.fifo[this.fifoLen++] = input;
    this.drainFrames(this.smoothShift);

    let wet: number;
    if (this.olaRead < this.olaWrite) {
      wet = this.ola[this.olaRead++];
    } else {
      wet = dryDelayed;
    }

    const wetMix = Math.min(1, Math.abs(this.smoothShift) / 0.5);
    return dryDelayed * (1 - wetMix) + wet * wetMix;
  }

  private trimFifo() {
    const hop = VOCODER_HOP;
    while (this.fifoLen > VOCODER_FFT_SIZE) {
      this.fifo.copyWithin(0, hop);
      this.fifoLen -= hop;
    }
  }

  private drainFrames(shiftSemitones: number) {
    const n = VOCODER_FFT_SIZE;
    const hop = VOCODER_HOP;
    const half = n / 2;

    while (this.fifoLen >= n) {
      const frameSec = this.shiftFn
        ? this.shiftFn(Math.max(0, this.timelineSec() - (n - hop) / this.sampleRate / this.speed))
        : shiftSemitones;
      const ratio = Math.abs(frameSec) < 0.001 ? 1 : Math.pow(2, frameSec / 12);

      this.frameRe.fill(0);
      this.frameIm.fill(0);
      for (let i = 0; i < n; i++) this.frameRe[i] = this.fifo[i] * this.win[i];
      fft(this.frameRe, this.frameIm);

      const mag = new Float32Array(half);
      const phase = new Float32Array(half);
      for (let k = 0; k < half; k++) {
        mag[k] = Math.hypot(this.frameRe[k], this.frameIm[k]);
        phase[k] = Math.atan2(this.frameIm[k], this.frameRe[k]);
      }
      const envelope = spectralEnvelope(mag, half, 48);

      this.outRe.fill(0);
      this.outIm.fill(0);

      if (Math.abs(frameSec) < 0.001) {
        for (let k = 0; k < half; k++) {
          this.outRe[k] = this.frameRe[k];
          this.outIm[k] = this.frameIm[k];
        }
        for (let k = 1; k < half - 1; k++) {
          this.outRe[n - k] = this.outRe[k];
          this.outIm[n - k] = -this.outIm[k];
        }
      } else {
        const shiftedMag = new Float32Array(half);
        for (let k = 0; k < half; k++) {
          const src = k / ratio;
          const i0 = Math.floor(src);
          const frac = src - i0;
          if (i0 < 0 || i0 >= half - 1) continue;

          const omega = (TWO_PI * k) / n;
          const phaseDiff = princarg(phase[i0] - this.prevPhase[i0] - omega * hop);
          const instFreq = omega + phaseDiff / hop;
          this.synthPhase[k] += instFreq * ratio * hop;
          this.prevPhase[i0] = phase[i0];

          shiftedMag[k] = mag[i0] + (mag[i0 + 1] - mag[i0]) * frac;
          this.outMag[k] = shiftedMag[k];
          this.outRe[k] = shiftedMag[k] * Math.cos(this.synthPhase[k]);
          this.outIm[k] = shiftedMag[k] * Math.sin(this.synthPhase[k]);
        }

        const shiftedEnv = spectralEnvelope(shiftedMag, half, 48);
        for (let k = 0; k < half; k++) {
          const corr = shiftedEnv[k] > 1e-8 ? envelope[k] / shiftedEnv[k] : 1;
          const m = this.outMag[k] * corr;
          this.outRe[k] = m * Math.cos(this.synthPhase[k]);
          this.outIm[k] = m * Math.sin(this.synthPhase[k]);
        }
        for (let k = 1; k < half - 1; k++) {
          this.outRe[n - k] = this.outRe[k];
          this.outIm[n - k] = -this.outIm[k];
        }
      }

      ifft(this.outRe, this.outIm);
      for (let i = 0; i < n; i++) {
        this.ola[this.olaWrite + i] += this.outRe[i] * this.win[i];
      }
      this.olaWrite += hop;
      this.fifo.copyWithin(0, hop);
      this.fifoLen -= hop;
    }
  }

  flushTail(): void {
    for (let i = 0; i < VOCODER_FFT_SIZE; i++) {
      this.pushSample(0, 0);
    }
  }

  readAvailable(): number {
    return this.olaWrite - this.olaRead;
  }

  readSample(): number {
    return this.olaRead < this.olaWrite ? this.ola[this.olaRead++] : 0;
  }
}

const renderWithVocoder = (
  input: Float32Array,
  sampleRate: number,
  shiftAt: (sec: number) => number
): Float32Array => {
  const voc = new PitchVocoderStream(sampleRate);
  voc.reset(0);
  const pad = VOCODER_LATENCY;
  const padded = new Float32Array(input.length + pad * 2);
  padded.set(input, pad);
  const tempOut = new Float32Array(padded.length);
  voc.processBlock(padded, tempOut, shiftAt, 0, 1);
  voc.flushTail();
  let tailIdx = padded.length;
  while (voc.readAvailable() > 0 && tailIdx < tempOut.length) {
    tempOut[tailIdx++] = voc.readSample();
  }
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = tempOut[i + pad];
  }
  return out;
};

export const renderChannelPitchNotes = (
  input: Float32Array,
  sampleRate: number,
  notes: PitchNote[],
  limit: number
): Float32Array => {
  if (!notes.some((n) => Math.round(n.shift) !== 0)) return input.slice();
  return renderWithVocoder(input, sampleRate, (sec) => shiftAtNotes(notes, sec, limit));
};

export const renderChannelWholeShift = (
  input: Float32Array,
  sampleRate: number,
  semitones: number
): Float32Array => {
  if (semitones === 0) return input.slice();
  return renderWithVocoder(input, sampleRate, () => semitones);
};
