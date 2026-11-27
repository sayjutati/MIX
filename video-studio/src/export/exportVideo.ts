import { mixAudioOffline } from "../audio/mixOffline";
import { renderFrameAsync } from "../preview/compositor";
import type { EditorState } from "../types";
import { DEFAULT_FPS, projectDuration } from "../types";
import type { ExportFormat } from "./exportCapabilities";
import {
  pickNativeMp4Mime,
  pickWebmMime,
} from "./exportCapabilities";
import { transcodeWebmToMp4 } from "./transcodeMp4";
import {
  evenDimension,
  tryExportMp4WithWebCodecs,
  tryExportWebmWithWebCodecs,
} from "./webcodecsExport";

export type { ExportFormat } from "./exportCapabilities";
export { exportFormatHint, getMp4ExportMethod } from "./exportCapabilities";

export interface ExportOptions {
  fps?: number;
  onProgress?: (p: number, status?: string) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  extension: ExportFormat;
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export const frameTimeAt = (elapsedSec: number, duration: number) =>
  Math.min(Math.max(0, elapsedSec), Math.max(0, duration - 1e-3));

/** WebCodecs 非対応ブラウザ向けのフォールバック録画 */
const recordTimelineFallback = async (
  canvas: HTMLCanvasElement,
  state: EditorState,
  mime: string,
  audioBuffer: AudioBuffer | null,
  duration: number,
  fps: number,
  opts: ExportOptions
): Promise<Blob> => {
  canvas.width = evenDimension(state.previewWidth);
  canvas.height = evenDimension(state.previewHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");

  const renderState: EditorState = {
    ...state,
    previewWidth: canvas.width,
    previewHeight: canvas.height,
    isPlaying: false,
  };

  const audioFeed = audioBuffer ? createAudioFeed(audioBuffer) : null;
  const stream = canvas.captureStream(fps);
  if (audioFeed) stream.addTrack(audioFeed.track);

  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: Blob[] = [];

  try {
    return await new Promise<Blob>((resolve, reject) => {
      const onAbort = () => {
        if (recorder.state !== "inactive") recorder.stop();
        reject(new DOMException("書き出しを中断しました", "AbortError"));
      };
      opts.signal?.addEventListener("abort", onAbort, { once: true });

      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        opts.signal?.removeEventListener("abort", onAbort);
        resolve(new Blob(chunks, { type: mime.split(";")[0] }));
      };
      recorder.onerror = () => {
        opts.signal?.removeEventListener("abort", onAbort);
        reject(new Error("MediaRecorder failed"));
      };

      const run = async () => {
        await renderFrameAsync(ctx, renderState, 0);
        recorder.start(100);
        audioFeed?.start();
        const t0 = performance.now();

        for (;;) {
          if (opts.signal?.aborted) return;
          const elapsed = (performance.now() - t0) / 1000;
          if (elapsed >= duration) break;
          await renderFrameAsync(ctx, renderState, frameTimeAt(elapsed, duration));
          opts.onProgress?.(Math.min(1, elapsed / duration), "フレームを書き出し中…");
          const nextFrameAt = t0 + ((Math.floor(elapsed * fps) + 1) / fps) * 1000;
          await sleep(Math.max(0, nextFrameAt - performance.now()));
        }
        await renderFrameAsync(ctx, renderState, frameTimeAt(duration, duration));
        opts.onProgress?.(1, "フレームを書き出し中…");
        recorder.stop();
      };

      void run().catch((err) => {
        if (recorder.state !== "inactive") recorder.stop();
        reject(err);
      });
    });
  } finally {
    audioFeed?.dispose();
    stream.getTracks().forEach((t) => t.stop());
  }
};

interface AudioFeed {
  track: MediaStreamTrack;
  start: () => void;
  dispose: () => void;
}

const createAudioFeed = (buffer: AudioBuffer): AudioFeed | null => {
  try {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(dest);
    const track = dest.stream.getAudioTracks()[0];
    if (!track) {
      void ctx.close();
      return null;
    }
    return {
      track,
      start: () => {
        void ctx.resume();
        src.start();
      },
      dispose: () => {
        try {
          src.stop();
        } catch {
          /* 未開始 */
        }
        void ctx.close();
      },
    };
  } catch {
    return null;
  }
};

/**
 * 書き出しメインエントリ：
 * 1. WebCodecs による非リアルタイム・フレーム完全固定（CFR）エンコードを最優先（音ズレ・コマ落ちゼロ）
 * 2. AAC エンコード非対応環境では WebCodecs CFR WebM → FFmpeg.wasm H.264/AAC 変換
 * 3. WebCodecs 自体が無い環境のみ MediaRecorder へ自動フォールバック
 */
export const exportVideo = async (
  canvas: HTMLCanvasElement,
  state: EditorState,
  format: ExportFormat,
  opts: ExportOptions = {}
): Promise<ExportResult> => {
  const fps = opts.fps ?? state.fps ?? DEFAULT_FPS;
  const duration = projectDuration(state.clips, state.textClips);

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }
  if (opts.signal?.aborted) throw new DOMException("書き出しを中断しました", "AbortError");

  opts.onProgress?.(0.01, "音声をミックス中…");
  const audioBuffer = await mixAudioOffline(state, duration);
  if (opts.signal?.aborted) throw new DOMException("書き出しを中断しました", "AbortError");

  if (format === "webm") {
    const wcWebm = await tryExportWebmWithWebCodecs({
      state,
      duration,
      fps,
      audioBuffer,
      onProgress: opts.onProgress,
      signal: opts.signal,
    }).catch((err) => {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      return null;
    });
    if (wcWebm) return { blob: wcWebm, extension: "webm" };

    const fallbackWebm = await recordTimelineFallback(
      canvas,
      state,
      pickWebmMime(),
      audioBuffer,
      duration,
      fps,
      opts
    );
    return { blob: fallbackWebm, extension: "webm" };
  }

  // MP4 第1経路: WebCodecs H.264 + AAC 直接 mux
  const wcMp4 = await tryExportMp4WithWebCodecs({
    state,
    duration,
    fps,
    audioBuffer,
    onProgress: opts.onProgress,
    signal: opts.signal,
  }).catch((err) => {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return null;
  });
  if (wcMp4) return { blob: wcMp4, extension: "mp4" };

  // MP4 第2経路: WebCodecs CFR WebM → FFmpeg.wasm MP4
  const wcWebmForMp4 = await tryExportWebmWithWebCodecs({
    state,
    duration,
    fps,
    audioBuffer,
    onProgress: (p, s) => opts.onProgress?.(p * 0.65, s),
    signal: opts.signal,
  }).catch((err) => {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return null;
  });
  if (wcWebmForMp4) {
    const mp4Blob = await transcodeWebmToMp4(wcWebmForMp4, (p, s) =>
      opts.onProgress?.(0.65 + p * 0.35, s)
    );
    return { blob: mp4Blob, extension: "mp4" };
  }

  // MP4 第3経路: MediaRecorder WebM → FFmpeg.wasm MP4（ネイティブ MediaRecorder MP4 は mdhd 破損があるため最後に回す）
  try {
    const webmBlob = await recordTimelineFallback(
      canvas,
      state,
      pickWebmMime(),
      audioBuffer,
      duration,
      fps,
      {
        ...opts,
        onProgress: (p, status) => opts.onProgress?.(p * 0.65, status),
      }
    );
    const mp4Blob = await transcodeWebmToMp4(webmBlob, (p, status) =>
      opts.onProgress?.(0.65 + p * 0.35, status)
    );
    return { blob: mp4Blob, extension: "mp4" };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    const nativeMime = pickNativeMp4Mime();
    if (!nativeMime) throw err;
    const blob = await recordTimelineFallback(canvas, state, nativeMime, audioBuffer, duration, fps, opts);
    return { blob, extension: "mp4" };
  }
};

export const exportToWebM = (
  canvas: HTMLCanvasElement,
  state: EditorState,
  opts?: ExportOptions
) => exportVideo(canvas, state, "webm", opts).then((r) => r.blob);

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
