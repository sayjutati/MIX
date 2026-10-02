import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const CORE_VER = "0.12.10";
const CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VER}/dist/esm`;

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

const loadFfmpeg = async (onStatus?: (msg: string) => void): Promise<FFmpeg> => {
  if (ffmpeg?.loaded) return ffmpeg;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    onStatus?.("変換エンジンを読み込み中…");
    const instance = new FFmpeg();
    instance.on("progress", ({ progress }) => {
      if (progress >= 0 && progress <= 1) {
        onStatus?.(`MP4 に変換中… ${Math.round(progress * 100)}%`);
      }
    });
    await instance.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpeg = instance;
    return instance;
  })();
  // 失敗（オフライン等）を永続化させず、次回の書き出しで再試行できるようにする
  loadPromise.catch(() => {
    loadPromise = null;
  });

  return loadPromise;
};

/** WebM → MP4（H.264 + AAC, YouTube 互換） */
export const transcodeWebmToMp4 = async (
  webm: Blob,
  onProgress?: (p: number, status?: string) => void
): Promise<Blob> => {
  const ff = await loadFfmpeg((s) => onProgress?.(0.75, s));
  onProgress?.(0.78, "MP4 に変換中…");

  await ff.writeFile("input.webm", await fetchFile(webm));
  const cleanup = async () => {
    await ff.deleteFile("input.webm").catch(() => {});
    await ff.deleteFile("output.mp4").catch(() => {});
  };
  try {
    return await run(ff, onProgress);
  } finally {
    await cleanup();
  }
};

const run = async (
  ff: FFmpeg,
  onProgress?: (p: number, status?: string) => void
): Promise<Blob> => {
  const code = await ff.exec([
    "-i",
    "input.webm",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    "output.mp4",
  ]);

  if (code !== 0) throw new Error("MP4 変換に失敗しました");
  const data = await ff.readFile("output.mp4");

  onProgress?.(1, "完了");
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
  return new Blob([bytes], { type: "video/mp4" });
};
