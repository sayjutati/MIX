import type { Track } from "../types";
import { clipEffectiveOffset } from "../types";
import { bufferToMono } from "./pitch";
import { decodeAudioUrl } from "./decode";

const ANALYSIS_RATE = 8000;
/** 録音は BGM より遅れがち — 後方に広めに探索 */
const SEARCH_BEFORE_SEC = 0.12;
const SEARCH_AFTER_SEC = 0.85;
const MIN_CONFIDENCE = 0.22;

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

/** 立ち上がりを強調してビート合わせしやすくする */
const onsetEmphasis = (x: Float32Array): Float32Array => {
  const out = new Float32Array(x.length);
  for (let i = 1; i < x.length; i++) out[i] = x[i] - x[i - 1];
  let peak = 1e-9;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < out.length; i++) out[i] /= peak;
  return out;
};

const normalize = (x: Float32Array): Float32Array => {
  let e = 0;
  for (let i = 0; i < x.length; i++) e += x[i] * x[i];
  e = Math.sqrt(e / x.length) || 1;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] / e;
  return out;
};

/** 先頭の無音区間を検出（MediaRecorder の起動遅れ対策） */
export const measureLeadingSilence = (
  mono: Float32Array,
  sampleRate: number,
  threshold = 0.012
): number => {
  const win = Math.max(1, Math.floor(sampleRate * 0.008));
  for (let i = 0; i < mono.length; i += win) {
    let peak = 0;
    for (let j = i; j < Math.min(i + win, mono.length); j++) {
      peak = Math.max(peak, Math.abs(mono[j]));
    }
    if (peak >= threshold) return i / sampleRate;
  }
  return 0;
};

/** 正規化相互相関 — ref 内で seek と最も一致するラグ（サンプル） */
const bestLag = (ref: Float32Array, seek: Float32Array): { lag: number; score: number } => {
  if (seek.length < 16 || ref.length < seek.length + 16) {
    return { lag: 0, score: 0 };
  }
  const s = normalize(onsetEmphasis(seek));
  const maxLag = ref.length - s.length;
  let best = 0;
  let bestScore = -Infinity;
  for (let lag = 0; lag <= maxLag; lag++) {
    let dot = 0;
    for (let i = 0; i < s.length; i++) dot += s[i] * ref[lag + i];
    if (dot > bestScore) {
      bestScore = dot;
      best = lag;
    }
  }
  const len = Math.min(s.length, 128);
  let refE = 0;
  for (let i = 0; i < len; i++) refE += ref[best + i] ** 2;
  refE = Math.sqrt(refE / len) || 1;
  const score = Math.max(0, Math.min(1, bestScore / (len * refE)));
  return { lag: best, score };
};

/** タイムライン上 [startSec, startSec+dur) の BGM をモノラル合成 */
const renderBgmWindow = async (
  ctx: BaseAudioContext,
  tracks: Track[],
  startSec: number,
  durSec: number
): Promise<{ mono: Float32Array; sampleRate: number } | null> => {
  const bgmTracks = tracks.filter((t) => t.kind === "bgm" && t.clips.length > 0);
  if (bgmTracks.length === 0) return null;

  const sampleRate = ctx.sampleRate;
  const len = Math.ceil(durSec * sampleRate);
  const mix = new Float32Array(len);
  let hits = 0;

  for (const track of bgmTracks) {
    const speed = track.speed || 1;
    for (const clip of track.clips) {
      const clipStart = clipEffectiveOffset(track, clip);
      const clipEnd = clipStart + clip.duration / speed;
      const winStart = startSec;
      const winEnd = startSec + durSec;
      if (clipEnd <= winStart || clipStart >= winEnd) continue;

      const buf = await decodeAudioUrl(clip.url, ctx);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const globalT = startSec + i / sampleRate;
        const local = (globalT - clipStart) * speed;
        if (local < 0 || local >= buf.duration) continue;
        const idx = Math.floor(local * buf.sampleRate);
        if (idx >= 0 && idx < ch.length) {
          mix[i] += ch[idx];
          hits++;
        }
      }
    }
  }

  if (hits < 64) return null;
  return { mono: mix, sampleRate };
};

export type AlignResult = {
  offsetSec: number;
  confidence: number;
  /** 分析上のシフト量（秒）。正=クリップを遅らせる */
  shiftSec: number;
  method: "correlation" | "latency" | "none";
};

/**
 * 録音ボーカルを BGM 波形と照合し、最適なクリップ開始位置（秒）を返す。
 * anchorSec = 録音開始時のタイムライン位置（補正前）
 */
export const alignVocalToBgm = async (
  tracks: Track[],
  vocalBuffer: AudioBuffer,
  anchorSec: number,
  ctx: BaseAudioContext,
  latencyFallbackSec = 0
): Promise<AlignResult> => {
  const hasBgm = tracks.some((t) => t.kind === "bgm" && t.clips.length > 0);
  if (!hasBgm) {
    const off = Math.max(0, anchorSec - latencyFallbackSec);
    return {
      offsetSec: off,
      confidence: 0,
      shiftSec: -latencyFallbackSec,
      method: latencyFallbackSec > 0 ? "latency" : "none",
    };
  }

  const vocalMono = bufferToMono(vocalBuffer);
  const leadSec = measureLeadingSilence(vocalMono, vocalBuffer.sampleRate);
  const analysisLen = Math.min(vocalBuffer.duration - leadSec, 12);
  if (analysisLen < 0.25) {
    const off = Math.max(0, anchorSec - latencyFallbackSec);
    return { offsetSec: off, confidence: 0, shiftSec: -latencyFallbackSec, method: "latency" };
  }

  const windowStart = Math.max(0, anchorSec - SEARCH_BEFORE_SEC);
  const windowDur =
    SEARCH_BEFORE_SEC + SEARCH_AFTER_SEC + analysisLen + leadSec + 0.1;

  const bgm = await renderBgmWindow(ctx, tracks, windowStart, windowDur);
  if (!bgm) {
    const off = Math.max(0, anchorSec - latencyFallbackSec);
    return { offsetSec: off, confidence: 0, shiftSec: -latencyFallbackSec, method: "latency" };
  }

  const vocalSlice = vocalMono.subarray(
    Math.floor(leadSec * vocalBuffer.sampleRate),
    Math.floor((leadSec + analysisLen) * vocalBuffer.sampleRate)
  );
  const vocalDs = downsample(vocalSlice, vocalBuffer.sampleRate, ANALYSIS_RATE);
  const refDs = downsample(bgm.mono, bgm.sampleRate, ANALYSIS_RATE);
  const refE = onsetEmphasis(refDs);

  const nominalLag = Math.round(
    (anchorSec + leadSec - windowStart) * ANALYSIS_RATE
  );
  const searchBefore = Math.round(SEARCH_BEFORE_SEC * ANALYSIS_RATE);
  const searchAfter = Math.round(SEARCH_AFTER_SEC * ANALYSIS_RATE);

  const lagMin = Math.max(0, nominalLag - searchBefore);
  const lagMax = Math.min(refE.length - vocalDs.length, nominalLag + searchAfter);
  if (lagMax <= lagMin) {
    const off = Math.max(0, anchorSec - latencyFallbackSec);
    return { offsetSec: off, confidence: 0, shiftSec: -latencyFallbackSec, method: "latency" };
  }

  const refSlice = refE.subarray(lagMin, lagMax + vocalDs.length);
  const { lag, score } = bestLag(refSlice, vocalDs);
  const bestLagAbs = lagMin + lag;

  if (score < MIN_CONFIDENCE) {
    const off = Math.max(0, anchorSec - latencyFallbackSec);
    return {
      offsetSec: off,
      confidence: score,
      shiftSec: -latencyFallbackSec,
      method: "latency",
    };
  }

  const alignTimeSec = windowStart + bestLagAbs / ANALYSIS_RATE;
  const offsetSec = Math.max(0, alignTimeSec - leadSec);
  const shiftSec = offsetSec - anchorSec;

  return { offsetSec, confidence: score, shiftSec, method: "correlation" };
};
