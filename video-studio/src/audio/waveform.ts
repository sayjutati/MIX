export interface WaveformData {
  peaks: number[];
  duration: number;
}

const waveCache = new Map<string, Promise<WaveformData>>();

export const getWaveformData = (
  url: string,
  buckets = 480
): Promise<WaveformData> => {
  const cached = waveCache.get(url);
  if (cached) return cached;

  const p = (async (): Promise<WaveformData> => {
    try {
      const res = await fetch(url);
      const ctx = new AudioContext();
      let buf: AudioBuffer;
      try {
        buf = await ctx.decodeAudioData(await res.arrayBuffer());
      } finally {
        void ctx.close();
      }

      const ch0 = buf.getChannelData(0);
      const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
      const total = ch0.length;
      const count = Math.min(buckets, Math.max(32, Math.floor(buf.duration * 30)));
      const block = Math.max(1, Math.floor(total / count));
      const peaks: number[] = [];
      for (let i = 0; i < count; i++) {
        let max = 0;
        const start = i * block;
        const end = Math.min(total, start + block);
        const stride = Math.max(1, Math.floor((end - start) / 64));
        for (let j = start; j < end; j += stride) {
          const v = ch1 ? Math.max(Math.abs(ch0[j]!), Math.abs(ch1[j]!)) : Math.abs(ch0[j]!);
          if (v > max) max = v;
        }
        peaks.push(max);
      }
      const top = Math.max(...peaks, 0.001);
      return {
        peaks: peaks.map((v) => v / top),
        duration: buf.duration,
      };
    } catch {
      return {
        peaks: Array.from({ length: 64 }, () => 0.18),
        duration: 0,
      };
    }
  })();

  waveCache.set(url, p);
  return p;
};

export const getWaveformPeaks = async (url: string, buckets = 240): Promise<number[]> =>
  (await getWaveformData(url, buckets)).peaks;

/** クリップのトリム区間 [inPoint, inPoint + duration * speed] に対応するピーク列を切り出す */
export const slicePeaksForClip = (
  data: WaveformData,
  inPoint: number,
  clipDuration: number,
  speed: number,
  targetBars: number
): number[] => {
  const srcTotal = data.duration;
  const peaks = data.peaks;
  if (!peaks.length) return [];
  const bars = Math.max(8, Math.min(360, Math.round(targetBars)));
  if (srcTotal <= 0) {
    return Array.from({ length: bars }, (_, i) => peaks[Math.floor((i / bars) * peaks.length)] ?? 0.2);
  }
  const srcStart = Math.max(0, inPoint);
  const srcSpan = Math.max(0.01, clipDuration * (speed || 1));
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const t0 = srcStart + (srcSpan * i) / bars;
    const t1 = srcStart + (srcSpan * (i + 1)) / bars;
    if (t0 >= srcTotal) {
      out.push(0.03);
      continue;
    }
    const idx0 = Math.max(0, Math.min(peaks.length - 1, Math.floor((t0 / srcTotal) * peaks.length)));
    const idx1 = Math.max(idx0, Math.min(peaks.length - 1, Math.ceil((t1 / srcTotal) * peaks.length) - 1));
    let max = 0;
    for (let k = idx0; k <= idx1; k++) {
      if (peaks[k]! > max) max = peaks[k]!;
    }
    out.push(max);
  }
  return out;
};
