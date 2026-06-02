import type { MediaAsset, MediaKind } from "../types";

export const probeVideo = (url: string): Promise<{ duration: number; width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    v.onloadedmetadata = () =>
      resolve({
        duration: v.duration || 0,
        width: v.videoWidth,
        height: v.videoHeight,
      });
    v.onerror = () => reject(new Error("video metadata failed"));
  });

export const probeImage = (url: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });

export const fileToAsset = async (file: File): Promise<MediaAsset> => {
  const url = URL.createObjectURL(file);
  const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const mime = file.type;

  if (mime.startsWith("video/")) {
    const meta = await probeVideo(url);
    const hasAudio = await probeVideoHasAudio(url);
    return {
      id,
      name: file.name,
      kind: "video",
      url,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      hasAudio,
    };
  }
  if (mime.startsWith("audio/")) {
    const duration = await probeAudio(url);
    return { id, name: file.name, kind: "audio", url, duration };
  }
  const img = await probeImage(url);
  return {
    id,
    name: file.name,
    kind: "image",
    url,
    duration: 5,
    width: img.width,
    height: img.height,
  };
};

/** 動画に音声ストリームがあるか（decode フォールバック） */
export const probeVideoHasAudio = async (url: string): Promise<boolean> => {
  const v = document.createElement("video");
  v.preload = "metadata";
  v.src = url;
  await new Promise<void>((res, rej) => {
    v.onloadedmetadata = () => res();
    v.onerror = () => rej();
  }).catch(() => {});
  const tracks = (v as HTMLVideoElement & { audioTracks?: { length: number } }).audioTracks;
  if (tracks && tracks.length > 0) return true;
  try {
    const r = await fetch(url);
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await r.arrayBuffer());
    await ctx.close();
    return buf.duration > 0.01 && buf.numberOfChannels > 0;
  } catch {
    return true;
  }
};

const probeAudio = (url: string): Promise<number> =>
  new Promise((resolve) => {
    const a = new Audio();
    a.src = url;
    a.addEventListener("loadedmetadata", () => resolve(a.duration || 0), { once: true });
    a.addEventListener("error", () => resolve(0), { once: true });
  });

export const kindFromFile = (file: File): MediaKind | null => {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  return null;
};
