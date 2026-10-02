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

/**
 * MediaRecorder は実時間で録画されるため、映像フレームの描画時刻も実時間に同期させる。
 * （1 フレームごとに固定 sleep すると、描画時間ぶん映像だけ伸びて音声とズレる）
 */
export const frameTimeAt = (elapsedSec: number, duration: number) =>
  Math.min(Math.max(0, elapsedSec), Math.max(0, duration - 1e-3));

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

  const audioBuffer = await mixAudioOffline(state, duration);
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
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime.split(";")[0] }));
      recorder.onerror = () => reject(new Error("MediaRecorder failed"));

      const run = async () => {
        await renderFrameAsync(ctx, state, 0);
        recorder.start(100);
        audioFeed?.start();
        const t0 = performance.now();

        for (;;) {
          const elapsed = (performance.now() - t0) / 1000;
          if (elapsed >= duration) break;
          await renderFrameAsync(ctx, state, frameTimeAt(elapsed, duration));
          opts.onProgress?.(Math.min(1, elapsed / duration), "フレームを書き出し中…");
          const nextFrameAt = t0 + ((Math.floor(elapsed * fps) + 1) / fps) * 1000;
          await sleep(Math.max(0, nextFrameAt - performance.now()));
        }
        await renderFrameAsync(ctx, state, frameTimeAt(duration, duration));
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

/** ミックス済み音声を MediaStream トラックとして流す。start() の瞬間から再生される */
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
