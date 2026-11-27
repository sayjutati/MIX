export type ExportFormat = "mp4" | "webm";

export type Mp4ExportMethod = "webcodecs" | "transcode" | "native";

const WEBM_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

const MP4_CANDIDATES = [
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4;codecs=h264,aac",
  "video/mp4;codecs=avc1",
  "video/mp4",
];

export const hasWebCodecsVideo = (): boolean =>
  typeof globalThis.VideoEncoder === "function" && typeof globalThis.VideoFrame === "function";

export const pickWebmMime = (): string => {
  if (typeof MediaRecorder === "undefined") return "video/webm";
  for (const m of WEBM_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "video/webm";
};

export const pickNativeMp4Mime = (): string | null => {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of MP4_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
};

export const getMp4ExportMethod = (): Mp4ExportMethod => {
  if (hasWebCodecsVideo()) return "webcodecs";
  if (pickNativeMp4Mime()) return "native";
  return "transcode";
};

export const exportFormatHint = (format: ExportFormat): string => {
  if (format === "webm") {
    return hasWebCodecsVideo()
      ? "WebM（フレーム固定・音ズレなし）"
      : "WebM（軽量・ブラウザ互換）";
  }
  if (hasWebCodecsVideo()) {
    return "MP4（H.264 / フレーム固定・コマ落ち＆音ズレなし・YouTube推奨）";
  }
  return "MP4（H.264 変換・YouTube 向け）";
};
