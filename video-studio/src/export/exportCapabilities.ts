export type ExportFormat = "mp4" | "webm";

export type Mp4ExportMethod = "native" | "transcode";

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

export const pickWebmMime = (): string => {
  for (const m of WEBM_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "video/webm";
};

export const pickNativeMp4Mime = (): string | null => {
  for (const m of MP4_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
};

export const getMp4ExportMethod = (): Mp4ExportMethod =>
  pickNativeMp4Mime() ? "native" : "transcode";

export const exportFormatHint = (format: ExportFormat): string => {
  if (format === "webm") return "WebM（軽量・プレビュー向け）";
  if (getMp4ExportMethod() === "native") return "MP4（YouTube などにそのままアップロード可）";
  return "MP4（H.264 変換・YouTube 向け・初回は変換エンジン読込あり）";
};
