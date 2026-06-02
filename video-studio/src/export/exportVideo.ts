import { mixAudioOffline } from "../audio/mixOffline";
import { renderFrame } from "../preview/compositor";
import type { EditorState } from "../types";
import { projectDuration } from "../types";

export interface ExportOptions {
  fps?: number;
  onProgress?: (p: number) => void;
}

export const exportToWebM = async (
  canvas: HTMLCanvasElement,
  state: EditorState,
  opts: ExportOptions = {}
): Promise<Blob> => {
  const fps = opts.fps ?? 30;
  const duration = projectDuration(state.clips, state.textClips);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");

  const stream = canvas.captureStream(fps);
  const audioBuffer = await mixAudioOffline(state, duration);
  if (audioBuffer) {
    const track = await bufferToStreamTrack(audioBuffer);
    if (track) stream.addTrack(track);
  }

  const mime = pickMime();
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];

  return new Promise((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    recorder.onerror = () => reject(new Error("MediaRecorder failed"));

    let frame = 0;
    const totalFrames = Math.ceil(duration * fps);

    const tick = () => {
      const t = frame / fps;
      renderFrame(ctx, state, t);
      opts.onProgress?.(frame / totalFrames);
      frame++;
      if (frame <= totalFrames) {
        requestAnimationFrame(tick);
      } else {
        recorder.stop();
      }
    };

    recorder.start();
    tick();
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

const pickMime = (): string => {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "video/webm";
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};
