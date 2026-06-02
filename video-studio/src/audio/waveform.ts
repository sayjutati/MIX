const peakCache = new Map<string, number[]>();

export const getWaveformPeaks = async (
  url: string,
  buckets = 80
): Promise<number[]> => {
  const cached = peakCache.get(url);
  if (cached) return cached;

  try {
    const res = await fetch(url);
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    await ctx.close();

    const ch = buf.getChannelData(0);
    const block = Math.max(1, Math.floor(ch.length / buckets));
    const peaks: number[] = [];
    for (let i = 0; i < buckets; i++) {
      let max = 0;
      const start = i * block;
      const end = Math.min(ch.length, start + block);
      for (let j = start; j < end; j++) max = Math.max(max, Math.abs(ch[j]));
      peaks.push(max);
    }
    const top = Math.max(...peaks, 0.001);
    const normalized = peaks.map((p) => p / top);
    peakCache.set(url, normalized);
    return normalized;
  } catch {
    return Array.from({ length: buckets }, () => 0.2);
  }
};
