import { createMp3Encoder } from "./lameEncoder";
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
    const s = Math.max(-1, Math.min(1, input[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
};

const paddedBlock = (src: Int16Array, start: number) => {
  const slice = src.subarray(start, start + MP3_BLOCK_SIZE);
  if (slice.length === MP3_BLOCK_SIZE) return slice;
  const block = new Int16Array(MP3_BLOCK_SIZE);
  block.set(slice);
  return block;
};

const toU8 = (buf: Int8Array) => new Uint8Array(buf);

/** PCM を MP3 バイト列に（テストからも使う） */
export const pcmToMp3Bytes = (
  left: Int16Array,
  right: Int16Array | null,
  sampleRate: number,
  kbps = 192
): Uint8Array => {
  const channels = right ? 2 : 1;
  const encoder = createMp3Encoder(channels, sampleRate, kbps);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < left.length; i += MP3_BLOCK_SIZE) {
    const l = paddedBlock(left, i);
    const encoded = right ? encoder.encodeBuffer(l, paddedBlock(right, i)) : encoder.encodeBuffer(l);
    if (encoded.length > 0) chunks.push(toU8(encoded));
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(toU8(tail));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
};

/** AudioBuffer を MP3 Blob にエンコード（ブラウザ内完結） */
export const audioBufferToMp3 = (buffer: AudioBuffer, kbps = 192): Blob => {
  const channels = Math.min(2, buffer.numberOfChannels);
  const left = floatTo16BitPCM(buffer.getChannelData(0));
  const right = channels > 1 ? floatTo16BitPCM(buffer.getChannelData(1)) : null;
  const bytes = pcmToMp3Bytes(left, right, buffer.sampleRate, kbps);
  if (bytes.length < 32) throw new Error("MP3 encoder produced an empty file");
  return new Blob([bytes], { type: "audio/mpeg" });
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
