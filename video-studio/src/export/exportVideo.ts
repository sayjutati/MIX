import { mixAudioOffline } from "../audio/mixOffline";
import { renderFrameAsync } from "../preview/compositor";
import type { EditorState } from "../types";
import { projectDuration } from "../types";
import type { ExportFormat } from "./exportCapabilities";
import {
  getMp4ExportMethod,
  pickNativeMp4Mime,
  pickWebmMime,
} from "./exportCapabilities";
import { transcodeWebmToMp4 } from "./transcodeMp4";

export type { ExportFormat } from "./exportCapabilities";
export { exportFormatHint, getMp4ExportMethod } from "./exportCapabilities";

export interface ExportOptions {
  fps?: number;
  onProgress?: (p: number, status?: string) => void;
}

export interface ExportResult {
  blob: Blob;
  extension: ExportFormat;
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

const recordTimeline = async (
  canvas: HTMLCanvasElement,
  state: EditorState,
  mime: string,
  opts: ExportOptions
): Promise<Blob> => {
  const fps = opts.fps ?? 30;
  const duration = projectDuration(state.clips, state.textClips);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");

  await document.fonts.ready;

  const stream = canvas.captureStream(fps);
  const audioBuffer = await mixAudioOffline(state, duration);
  if (audioBuffer) {
    const track = await bufferToStreamTrack(audioBuffer);
    if (track) stream.addTrack(track);
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: Blob[] = [];

  return new Promise((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime.split(";")[0] }));
    recorder.onerror = () => reject(new Error("MediaRecorder failed"));

    const totalFrames = Math.ceil(duration * fps);
    const frameMs = 1000 / fps;

    const run = async () => {
      recorder.start(100);
      for (let frame = 0; frame <= totalFrames; frame++) {
        const t = frame / fps;
        await renderFrameAsync(ctx, state, t);
        opts.onProgress?.(frame / totalFrames, "フレームを書き出し中…");
        await sleep(frameMs);
      }
      recorder.stop();
    };

    void run().catch(reject);
  });
};

const bufferToStreamTrack = async (buffer: AudioBuffer): Promise<MediaStreamTrack | null> => {
  try {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(dest);
    src.start();
    src.onended = () => void ctx.close();
    return dest.stream.getAudioTracks()[0] ?? null;
  } catch {
    return null;
  }
};

/** 形式を選んで書き出し（MP4 は非対応ブラウザで自動変換） */
export const exportVideo = async (
  canvas: HTMLCanvasElement,
  state: EditorState,
  format: ExportFormat,
  opts: ExportOptions = {}
): Promise<ExportResult> => {
  if (format === "webm") {
    const blob = await recordTimeline(canvas, state, pickWebmMime(), opts);
    return { blob, extension: "webm" };
  }

  const nativeMime = pickNativeMp4Mime();
  if (nativeMime && getMp4ExportMethod() === "native") {
    try {
      const blob = await recordTimeline(canvas, state, nativeMime, opts);
      return { blob, extension: "mp4" };
    } catch {
      /* fall through to transcode */
    }
  }

  const webmBlob = await recordTimeline(canvas, state, pickWebmMime(), {
    ...opts,
    onProgress: (p, status) => opts.onProgress?.(p * 0.65, status),
  });

  const mp4Blob = await transcodeWebmToMp4(webmBlob, (p, status) =>
    opts.onProgress?.(0.65 + p * 0.35, status)
  );

  return { blob: mp4Blob, extension: "mp4" };
};

/** @deprecated exportVideo を使用 */
export const exportToWebM = (
  canvas: HTMLCanvasElement,
  state: EditorState,
  opts?: ExportOptions
) => exportVideo(canvas, state, "webm", opts).then((r) => r.blob);

export const downloadBlob = (blob: Blob, filename: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};
