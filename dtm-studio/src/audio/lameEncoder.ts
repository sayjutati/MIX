import lameMinSrc from "lamejs/lame.min.js?raw";

type Mp3EncoderInstance = {
  encodeBuffer: (left: Int16Array, right?: Int16Array) => Int8Array;
  flush: () => Int8Array;
};

type Mp3EncoderCtor = new (channels: number, sampleRate: number, kbps: number) => Mp3EncoderInstance;

type LameNs = { Mp3Encoder: Mp3EncoderCtor };

const MPEG_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000] as const;

/** MPEG が受け付けるサンプリングレートへ丸める */
export const mpegSampleRate = (sr: number) => {
  if ((MPEG_RATES as readonly number[]).includes(sr)) return sr;
  return MPEG_RATES.reduce((best, r) => (Math.abs(r - sr) < Math.abs(best - sr) ? r : best), 44100);
};

let cached: LameNs | null = null;

/** Vite が src/js を ESM 化すると MPEGMode が消えるので、同梱 UMD を使う */
export const loadLame = (): LameNs => {
  if (cached) return cached;
  const lame = new Function(`${lameMinSrc}\nreturn lamejs;`)() as LameNs;
  if (typeof lame?.Mp3Encoder !== "function") {
    throw new Error("MP3 encoder failed to load");
  }
  cached = lame;
  return lame;
};

export const createMp3Encoder = (channels: number, sampleRate: number, kbps: number) =>
  new (loadLame().Mp3Encoder)(channels, mpegSampleRate(sampleRate), kbps);
