import { Mp3Encoder } from "lamejs";
import { audioBufferToWav } from "./mixdown";

export type ExportFormat = "wav" | "mp3";

export const EXPORT_FORMAT_OPTIONS: {
  id: ExportFormat;
  label: string;
  hint: string;
}[] = [
  { id: "wav", label: "WAV", hint: "無圧縮・最高音質" },
  { id: "mp3", label: "MP3", hint: "圧縮・配布向け" },
];

const MP3_BLOCK_SIZE = 1152;

const floatTo16BitPCM = (input: Float32Array): Int16Array => {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
};

/** AudioBuffer を MP3 Blob にエンコード（ブラウザ内完結） */
export const audioBufferToMp3 = (buffer: AudioBuffer, kbps = 192): Blob => {
  const channels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const encoder = new Mp3Encoder(channels, sampleRate, kbps);

  const left = buffer.getChannelData(0);
  const right = channels > 1 ? buffer.getChannelData(1) : left;
  const chunks: Int8Array[] = [];

  for (let i = 0; i < left.length; i += MP3_BLOCK_SIZE) {
    const leftChunk = floatTo16BitPCM(left.subarray(i, i + MP3_BLOCK_SIZE));
    let encoded: Int8Array;
    if (channels === 1) {
      encoded = encoder.encodeBuffer(leftChunk);
    } else {
      const rightChunk = floatTo16BitPCM(right.subarray(i, i + MP3_BLOCK_SIZE));
      encoded = encoder.encodeBuffer(leftChunk, rightChunk);
    }
    if (encoded.length > 0) chunks.push(encoded);
  }

  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);

  return new Blob(chunks, { type: "audio/mpeg" });
};

export const encodeMixdown = (
  buffer: AudioBuffer,
  format: ExportFormat,
  mp3Kbps = 192
): { blob: Blob; extension: string; mime: string } => {
  if (format === "mp3") {
    return {
      blob: audioBufferToMp3(buffer, mp3Kbps),
      extension: "mp3",
      mime: "audio/mpeg",
    };
  }
  return {
    blob: audioBufferToWav(buffer),
    extension: "wav",
    mime: "audio/wav",
  };
};
