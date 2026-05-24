const RECORD_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

export const pickRecordMimeType = () =>
  RECORD_MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";

export const createMicStream = () =>
  navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      autoGainControl: false,
      noiseSuppression: false,
      channelCount: 1,
      sampleRate: 48000,
    },
  });

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
