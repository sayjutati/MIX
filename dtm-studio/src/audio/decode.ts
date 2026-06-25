const cache = new Map<string, Promise<AudioBuffer>>();

export const decodeAudioUrl = async (
  url: string,
  ctx: BaseAudioContext
): Promise<AudioBuffer> => {
  const hit = cache.get(url);
  if (hit) return hit;

  const task = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`);
    return ctx.decodeAudioData(await res.arrayBuffer());
  })();

  cache.set(url, task);
  try {
    return await task;
  } catch (e) {
    cache.delete(url);
    throw e;
  }
};

export const decodeAudioBlob = async (
  blob: Blob,
  ctx: BaseAudioContext
): Promise<AudioBuffer> => {
  const url = URL.createObjectURL(blob);
  try {
    return await decodeAudioUrl(url, ctx);
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const invalidateAudioCache = (url: string) => {
  cache.delete(url);
};
