import type { MediaAsset, MediaKind } from "../types";

/** これ以上の動画は音声有無・秒数デコードでファイル全体を読まない（メモリ保護） */
const MAX_DECODE_PROBE_BYTES = 150 * 1024 * 1024;

const releaseMedia = (el: HTMLMediaElement) => {
  el.removeAttribute("src");
  el.load();
};

const finiteDuration = (d: number) => (Number.isFinite(d) && d > 0 ? d : 0);

export const inferMime = (file: File): string => {
  if (file.type) return file.type;
  const lower = file.name.toLowerCase();
  if (/\.(mp4|m4v|mov)$/.test(lower)) return "video/mp4";
  if (/\.webm$/.test(lower)) return "video/webm";
  if (/\.mkv$/.test(lower)) return "video/x-matroska";
  if (/\.avi$/.test(lower)) return "video/x-msvideo";
  if (/\.ogv$/.test(lower)) return "video/ogg";
  if (/\.(mp3)$/.test(lower)) return "audio/mpeg";
  if (/\.(wav)$/.test(lower)) return "audio/wav";
  if (/\.(flac)$/.test(lower)) return "audio/flac";
  if (/\.(m4a|aac)$/.test(lower)) return "audio/mp4";
  if (/\.(ogg|opus)$/.test(lower)) return "audio/ogg";
  if (/\.(jpe?g)$/.test(lower)) return "image/jpeg";
  if (/\.(webp)$/.test(lower)) return "image/webp";
  if (/\.(avif)$/.test(lower)) return "image/avif";
  if (/\.(gif)$/.test(lower)) return "image/gif";
  if (/\.(bmp)$/.test(lower)) return "image/bmp";
  if (/\.(png|svg)$/.test(lower)) return "image/png";
  return "";
};

/**
 * MediaRecorder 生成の WebM などで loadedmetadata 時点の duration が Infinity になる問題に対処する。
 * 末尾付近へ一度シークして実長を確定させ、タイムアウト時は 0 を返す。
 */
const resolveInfiniteDuration = (el: HTMLMediaElement): Promise<number> =>
  new Promise((resolve) => {
    const initial = finiteDuration(el.duration);
    if (initial > 0 || el.duration !== Infinity) {
      resolve(initial);
      return;
    }
    let settled = false;
    const done = (val: number) => {
      if (settled) return;
      settled = true;
      el.removeEventListener("timeupdate", onUpdate);
      el.removeEventListener("durationchange", onUpdate);
      clearTimeout(timer);
      try {
        el.currentTime = 0;
      } catch {
        // ignore seek reset failure
      }
      resolve(val);
    };
    const onUpdate = () => {
      const d = finiteDuration(el.duration);
      if (d > 0) done(d);
    };
    const timer = setTimeout(() => done(finiteDuration(el.duration)), 1200);
    el.addEventListener("timeupdate", onUpdate);
    el.addEventListener("durationchange", onUpdate);
    try {
      el.currentTime = 1e101;
    } catch {
      done(0);
    }
  });

const decodeAudioInfo = async (
  url: string,
  size: number
): Promise<{ duration: number; hasAudio: boolean } | null> => {
  if (size > MAX_DECODE_PROBE_BYTES) return null;
  let ctx: AudioContext | null = null;
  try {
    const r = await fetch(url);
    ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await r.arrayBuffer());
    return {
      duration: finiteDuration(buf.duration),
      hasAudio: buf.duration > 0.01 && buf.numberOfChannels > 0,
    };
  } catch {
    return null;
  } finally {
    void ctx?.close();
  }
};

export const probeVideo = (
  url: string
): Promise<{ duration: number; width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      const width = v.videoWidth;
      const height = v.videoHeight;
      void resolveInfiniteDuration(v).then((duration) => {
        releaseMedia(v);
        resolve({ duration, width, height });
      });
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
  const mime = inferMime(file);

  try {
    if (mime.startsWith("video/")) {
      const meta = await probeVideo(url);
      let duration = meta.duration;
      let hasAudio = await probeVideoHasAudio(url, file.size);
      if (duration <= 0) {
        const decoded = await decodeAudioInfo(url, file.size);
        if (decoded && decoded.duration > 0) {
          duration = decoded.duration;
          hasAudio = decoded.hasAudio;
        }
      }
      return {
        id,
        name: file.name,
        kind: "video",
        mimeType: mime,
        url,
        duration: duration || 1,
        width: meta.width,
        height: meta.height,
        hasAudio,
      };
    }
    if (mime.startsWith("audio/")) {
      let duration = await probeAudio(url);
      if (duration <= 0) {
        const decoded = await decodeAudioInfo(url, file.size);
        if (decoded && decoded.duration > 0) duration = decoded.duration;
      }
      return {
        id,
        name: file.name,
        kind: "audio",
        mimeType: mime,
        url,
        duration: duration || 1,
      };
    }
    const img = await probeImage(url);
    return {
      id,
      name: file.name,
      kind: "image",
      mimeType: mime || "image/png",
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

  const decoded = await decodeAudioInfo(url, size);
  return decoded ? decoded.hasAudio : true;
};

const probeAudio = (url: string): Promise<number> =>
  new Promise((resolve) => {
    const a = new Audio();
    a.addEventListener(
      "loadedmetadata",
      () => {
        void resolveInfiniteDuration(a).then((d) => {
          releaseMedia(a);
          resolve(d);
        });
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
  const mime = inferMime(file);
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  return null;
};
