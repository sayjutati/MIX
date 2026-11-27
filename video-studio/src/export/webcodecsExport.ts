import { ArrayBufferTarget as Mp4Target, Muxer as Mp4Muxer } from "mp4-muxer";
import { ArrayBufferTarget as WebmTarget, Muxer as WebmMuxer } from "webm-muxer";
import { renderFrameAsync } from "../preview/compositor";
import type { EditorState } from "../types";

export interface FrameStep {
  index: number;
  /** コンポジション描画用の秒 */
  timeSec: number;
  /** エンコーダへ渡すマイクロ秒タイムスタンプ */
  timestampUs: number;
  /** 1フレームの表示長（マイクロ秒） */
  durationUs: number;
  keyFrame: boolean;
}

export const evenDimension = (n: number): number => Math.max(2, Math.floor(n / 2) * 2);

/**
 * プロジェクト長と FPS から厳密な固定フレームレート（CFR）計画を生成する。
 * 実時間（performance.now）に一切依存しないため、重い端末でもコマ落ち・VFR・音ズレが起きない。
 */
export const createFramePlan = (durationSec: number, rawFps = 30): FrameStep[] => {
  const fps = Math.max(12, Math.min(60, Math.round(rawFps || 30)));
  const safeDur = Math.max(1 / fps, durationSec);
  const totalFrames = Math.max(1, Math.round(safeDur * fps));
  const durationUs = Math.round(1_000_000 / fps);
  const keyInterval = Math.max(1, fps * 2);

  return Array.from({ length: totalFrames }, (_, index) => {
    const exactSec = index / fps;
    return {
      index,
      timeSec: Math.min(exactSec, Math.max(0, safeDur - 1e-4)),
      timestampUs: Math.round((index * 1_000_000) / fps),
      durationUs,
      keyFrame: index % keyInterval === 0,
    };
  });
};

const H264_CODECS = [
  "avc1.640033",
  "avc1.64002a",
  "avc1.640028",
  "avc1.4d002a",
  "avc1.4d0028",
  "avc1.42002a",
  "avc1.420028",
  "avc1.42001f",
];

const WEBM_VIDEO_CODECS: { webcodec: string; muxer: "V_VP9" | "V_VP8" }[] = [
  { webcodec: "vp09.00.10.08", muxer: "V_VP9" },
  { webcodec: "vp8", muxer: "V_VP8" },
];

const targetBitrateFor = (width: number, height: number, fps: number): number => {
  const pixelsPerSec = width * height * fps;
  // 1080p30 ≈ 8 Mbps, 1080p60 ≈ 12 Mbps, 720p30 ≈ 5 Mbps
  return Math.max(2_500_000, Math.min(18_000_000, Math.round(pixelsPerSec * 0.13)));
};

const yieldToMain = () => new Promise<void>((r) => window.setTimeout(r, 0));

const pickSupportedVideoConfig = async (
  candidates: VideoEncoderConfig[]
): Promise<VideoEncoderConfig | null> => {
  if (typeof VideoEncoder === "undefined") return null;
  for (const cfg of candidates) {
    try {
      const res = await VideoEncoder.isConfigSupported(cfg);
      if (res.supported) return res.config ?? cfg;
    } catch {
      /* 次のプロファイルを試す */
    }
  }
  return null;
};

const isAudioCodecSupported = async (codec: "mp4a.40.2" | "opus", sampleRate: number, channels: number) => {
  if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") return false;
  try {
    const res = await AudioEncoder.isConfigSupported({
      codec,
      sampleRate,
      numberOfChannels: channels,
      bitrate: 192_000,
    });
    return !!res.supported;
  } catch {
    return false;
  }
};

const feedAudioBuffer = async (
  encoder: AudioEncoder,
  buffer: AudioBuffer,
  signal?: AbortSignal
) => {
  const channels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const totalFrames = buffer.length;
  const chunkSize = 4096;
  const ch0 = buffer.getChannelData(0);
  const ch1 = channels > 1 ? buffer.getChannelData(1) : ch0;

  for (let offset = 0; offset < totalFrames; offset += chunkSize) {
    if (signal?.aborted) throw new DOMException("書き出しを中断しました", "AbortError");
    const frames = Math.min(chunkSize, totalFrames - offset);
    const planar = new Float32Array(frames * channels);
    planar.set(ch0.subarray(offset, offset + frames), 0);
    if (channels > 1) {
      planar.set(ch1.subarray(offset, offset + frames), frames);
    }
    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data: planar,
    });
    encoder.encode(audioData);
    audioData.close();
    while (encoder.encodeQueueSize > 12) {
      await yieldToMain();
    }
  }
  await encoder.flush();
};

export interface WebCodecsExportParams {
  state: EditorState;
  duration: number;
  fps: number;
  audioBuffer: AudioBuffer | null;
  onProgress?: (p: number, status?: string) => void;
  signal?: AbortSignal;
}

/**
 * WebCodecs + mp4-muxer による直接 MP4 (H.264 + AAC) オフライン書き出し。
 * サポート外の場合は null を返し、上位で WebCodecs WebM + FFmpeg 等へフォールバックさせる。
 */
export const tryExportMp4WithWebCodecs = async (
  params: WebCodecsExportParams
): Promise<Blob | null> => {
  const width = evenDimension(params.state.previewWidth);
  const height = evenDimension(params.state.previewHeight);
  const bitrate = targetBitrateFor(width, height, params.fps);

  const videoConfig = await pickSupportedVideoConfig(
    H264_CODECS.map((codec) => ({
      codec,
      width,
      height,
      bitrate,
      framerate: params.fps,
      avc: { format: "avc" as const },
    }))
  );
  if (!videoConfig) return null;

  const hasAudio = !!params.audioBuffer;
  const audioChannels = hasAudio ? Math.min(2, params.audioBuffer!.numberOfChannels) : 2;
  const audioRate = hasAudio ? params.audioBuffer!.sampleRate : 48000;
  if (hasAudio && !(await isAudioCodecSupported("mp4a.40.2", audioRate, audioChannels))) {
    return null;
  }

  const target = new Mp4Target();
  const muxer = new Mp4Muxer({
    target,
    video: { codec: "avc", width, height, frameRate: params.fps },
    audio: hasAudio
      ? { codec: "aac", numberOfChannels: audioChannels, sampleRate: audioRate }
      : undefined,
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });
  videoEncoder.configure({ ...videoConfig, avc: { format: "avc" } });

  let audioEncoder: AudioEncoder | null = null;
  if (hasAudio) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        encoderError = e instanceof Error ? e : new Error(String(e));
      },
    });
    audioEncoder.configure({
      codec: "mp4a.40.2",
      sampleRate: audioRate,
      numberOfChannels: audioChannels,
      bitrate: 192_000,
    });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;

  const renderState: EditorState = {
    ...params.state,
    previewWidth: width,
    previewHeight: height,
    isPlaying: false,
  };
  const plan = createFramePlan(params.duration, params.fps);

  try {
    if (audioEncoder && params.audioBuffer) {
      params.onProgress?.(0.03, "音声トラックをエンコード中…");
      await feedAudioBuffer(audioEncoder, params.audioBuffer, params.signal);
      if (encoderError) throw encoderError;
    }

    for (let i = 0; i < plan.length; i++) {
      if (params.signal?.aborted) throw new DOMException("書き出しを中断しました", "AbortError");
      if (encoderError) throw encoderError;

      const step = plan[i]!;
      await renderFrameAsync(ctx, renderState, step.timeSec);
      const vf = new VideoFrame(canvas, {
        timestamp: step.timestampUs,
        duration: step.durationUs,
      });
      videoEncoder.encode(vf, { keyFrame: step.keyFrame });
      vf.close();

      while (videoEncoder.encodeQueueSize > 5) {
        await yieldToMain();
      }
      if (i % 3 === 0 || i === plan.length - 1) {
        const pct = 0.06 + ((i + 1) / plan.length) * 0.9;
        params.onProgress?.(pct, `映像をレンダリング中… ${i + 1} / ${plan.length} f`);
        await yieldToMain();
      }
    }

    await videoEncoder.flush();
    if (encoderError) throw encoderError;
    params.onProgress?.(0.98, "MP4 ファイルを結合中…");
    muxer.finalize();
    params.onProgress?.(1, "完了");
    return new Blob([target.buffer], { type: "video/mp4" });
  } finally {
    try {
      if (videoEncoder.state !== "closed") videoEncoder.close();
    } catch {
      /* ignore */
    }
    try {
      if (audioEncoder && audioEncoder.state !== "closed") audioEncoder.close();
    } catch {
      /* ignore */
    }
  }
};

/**
 * WebCodecs + webm-muxer による直接 WebM (VP9/VP8 + Opus) オフライン書き出し。
 */
export const tryExportWebmWithWebCodecs = async (
  params: WebCodecsExportParams
): Promise<Blob | null> => {
  const width = evenDimension(params.state.previewWidth);
  const height = evenDimension(params.state.previewHeight);
  const bitrate = targetBitrateFor(width, height, params.fps);

  let chosenMuxCodec: "V_VP9" | "V_VP8" = "V_VP9";
  let videoConfig: VideoEncoderConfig | null = null;
  for (const c of WEBM_VIDEO_CODECS) {
    const supported = await pickSupportedVideoConfig([
      { codec: c.webcodec, width, height, bitrate, framerate: params.fps },
    ]);
    if (supported) {
      videoConfig = supported;
      chosenMuxCodec = c.muxer;
      break;
    }
  }
  if (!videoConfig) return null;

  const hasAudio = !!params.audioBuffer;
  const audioChannels = hasAudio ? Math.min(2, params.audioBuffer!.numberOfChannels) : 2;
  const audioRate = 48000;
  if (hasAudio && !(await isAudioCodecSupported("opus", audioRate, audioChannels))) {
    return null;
  }

  const target = new WebmTarget();
  const muxer = new WebmMuxer({
    target,
    video: { codec: chosenMuxCodec, width, height, frameRate: params.fps },
    audio: hasAudio
      ? { codec: "A_OPUS", numberOfChannels: audioChannels, sampleRate: audioRate }
      : undefined,
    firstTimestampBehavior: "offset",
  });

  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });
  videoEncoder.configure(videoConfig);

  let audioEncoder: AudioEncoder | null = null;
  if (hasAudio) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        encoderError = e instanceof Error ? e : new Error(String(e));
      },
    });
    audioEncoder.configure({
      codec: "opus",
      sampleRate: audioRate,
      numberOfChannels: audioChannels,
      bitrate: 192_000,
    });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;

  const renderState: EditorState = {
    ...params.state,
    previewWidth: width,
    previewHeight: height,
    isPlaying: false,
  };
  const plan = createFramePlan(params.duration, params.fps);

  try {
    if (audioEncoder && params.audioBuffer) {
      params.onProgress?.(0.03, "音声トラックをエンコード中…");
      await feedAudioBuffer(audioEncoder, params.audioBuffer, params.signal);
      if (encoderError) throw encoderError;
    }

    for (let i = 0; i < plan.length; i++) {
      if (params.signal?.aborted) throw new DOMException("書き出しを中断しました", "AbortError");
      if (encoderError) throw encoderError;

      const step = plan[i]!;
      await renderFrameAsync(ctx, renderState, step.timeSec);
      const vf = new VideoFrame(canvas, {
        timestamp: step.timestampUs,
        duration: step.durationUs,
      });
      videoEncoder.encode(vf, { keyFrame: step.keyFrame });
      vf.close();

      while (videoEncoder.encodeQueueSize > 5) {
        await yieldToMain();
      }
      if (i % 3 === 0 || i === plan.length - 1) {
        const pct = 0.06 + ((i + 1) / plan.length) * 0.9;
        params.onProgress?.(pct, `映像をレンダリング中… ${i + 1} / ${plan.length} f`);
        await yieldToMain();
      }
    }

    await videoEncoder.flush();
    if (encoderError) throw encoderError;
    params.onProgress?.(0.98, "WebM ファイルを結合中…");
    muxer.finalize();
    params.onProgress?.(1, "完了");
    return new Blob([target.buffer], { type: "video/webm" });
  } finally {
    try {
      if (videoEncoder.state !== "closed") videoEncoder.close();
    } catch {
      /* ignore */
    }
    try {
      if (audioEncoder && audioEncoder.state !== "closed") audioEncoder.close();
    } catch {
      /* ignore */
    }
  }
};
