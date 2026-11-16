const RECORD_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

/** ブラウザの自動音量(AGC)は切ってある。録音とメーターに掛ける入力ゲインの範囲 */
export const MIC_GAIN_MIN = 0.5;
export const MIC_GAIN_MAX = 8;
export const MIC_GAIN_DEFAULT = 3;

const MIC_GAIN_STORAGE_KEY = "mixdaw.micGain";

export const readStoredMicGain = () => {
  try {
    const raw = localStorage.getItem(MIC_GAIN_STORAGE_KEY);
    if (raw == null) return MIC_GAIN_DEFAULT;
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.min(MIC_GAIN_MAX, Math.max(MIC_GAIN_MIN, n));
  } catch {
    /* ストレージが使えない環境では既定値 */
  }
  return MIC_GAIN_DEFAULT;
};

export const storeMicGain = (value: number) => {
  try {
    localStorage.setItem(MIC_GAIN_STORAGE_KEY, String(value));
  } catch {
    /* noop */
  }
};

export const pickRecordMimeType = () =>
  RECORD_MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";

export const createMicStream = (deviceId?: string) =>
  navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      autoGainControl: false,
      noiseSuppression: false,
      channelCount: 1,
      sampleRate: 48000,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    },
  });

/** 利用可能なマイク（audioinput）一覧を取得 */
export const listMicDevices = async (): Promise<MediaDeviceInfo[]> => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput");
  } catch {
    return [];
  }
};

export const createMediaRecorder = (stream: MediaStream) => {
  const mimeType = pickRecordMimeType();
  const options: MediaRecorderOptions = mimeType
    ? { mimeType, audioBitsPerSecond: 256_000 }
    : { audioBitsPerSecond: 256_000 };
  try {
    return mimeType
      ? new MediaRecorder(stream, options)
      : new MediaRecorder(stream, { audioBitsPerSecond: 256_000 });
  } catch {
    return new MediaRecorder(stream);
  }
};
