import type { MediaAsset, MediaKind } from "../types";

/** これ以上の動画は音声有無の判定でファイル全体をデコードしない（メモリ保護） */
const MAX_DECODE_PROBE_BYTES = 150 * 1024 * 1024;

const releaseMedia = (el: HTMLMediaElement) => {
  el.removeAttribute("src");
  el.load();
};

const finiteDuration = (d: number) => (Number.isFinite(d) && d > 0 ? d : 0);

export const probeVideo = (url: string): Promise<{ duration: number; width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      const meta = {
        duration: finiteDuration(v.duration),
        width: v.videoWidth,
        height: v.videoHeight,
      };
      releaseMedia(v);
      resolve(meta);
    };
    v.onerror = () => {
      releaseMedia(v);
      reject(new Error("video metadata failed"));
    };
    v.src = url;
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

  try {
    if (mime.startsWith("video/")) {
      const meta = await probeVideo(url);
      const hasAudio = await probeVideoHasAudio(url, file.size);
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
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
};

/** 動画に音声ストリームがあるか（audioTracks → decode の順で判定） */
export const probeVideoHasAudio = async (url: string, size = 0): Promise<boolean> => {
  const v = document.createElement("video");
  v.preload = "metadata";
  await new Promise<void>((res) => {
    v.onloadedmetadata = () => res();
    v.onerror = () => res();
    v.src = url;
  });
  const tracks = (v as HTMLVideoElement & { audioTracks?: { length: number } }).audioTracks;
  const trackCount = tracks?.length;
  releaseMedia(v);
  if (trackCount !== undefined && trackCount > 0) return true;
  if (size > MAX_DECODE_PROBE_BYTES) return true;

  let ctx: AudioContext | null = null;
  try {
    const r = await fetch(url);
    ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await r.arrayBuffer());
    return buf.duration > 0.01 && buf.numberOfChannels > 0;
  } catch {
    // decode 不能は「音声なし」と「判定不能」を区別できないため、音声ありとして扱う
    return true;
  } finally {
    void ctx?.close();
  }
};

const probeAudio = (url: string): Promise<number> =>
  new Promise((resolve) => {
    const a = new Audio();
    a.addEventListener(
      "loadedmetadata",
      () => {
        const d = finiteDuration(a.duration);
        releaseMedia(a);
        resolve(d);
      },
      { once: true }
    );
    a.addEventListener(
      "error",
      () => {
        releaseMedia(a);
        resolve(0);
      },
      { once: true }
    );
    a.src = url;
  });

export const kindFromFile = (file: File): MediaKind | null => {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  return null;
};
