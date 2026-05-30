const RECORD_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

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
