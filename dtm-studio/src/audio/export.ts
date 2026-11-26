import { createMp3Encoder } from "./lameEncoder";

export type ExportFormat = "wav" | "mp3";

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

export const audioBufferToMp3 = (buffer: AudioBuffer, kbps = 192): Blob => {
  const channels = Math.min(2, buffer.numberOfChannels);
  const left = floatTo16BitPCM(buffer.getChannelData(0));
  const right = channels > 1 ? floatTo16BitPCM(buffer.getChannelData(1)) : null;
  const bytes = pcmToMp3Bytes(left, right, buffer.sampleRate, kbps);
  if (bytes.length < 32) throw new Error("MP3 encoder produced an empty file");
  return new Blob([bytes], { type: "audio/mpeg" });
};

export const encodeExport = (
  buffer: AudioBuffer,
  format: ExportFormat,
  mp3Kbps = 192
): { blob: Blob; extension: string } => {
  if (format === "mp3") {
    return { blob: audioBufferToMp3(buffer, mp3Kbps), extension: "mp3" };
  }
  return { blob: audioBufferToWav(buffer), extension: "wav" };
};

export const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const interleaved = new Float32Array(buffer.length * numChannels);
  if (numChannels === 2) {
    const l = buffer.getChannelData(0);
    const r = buffer.getChannelData(1);
    for (let i = 0; i < buffer.length; i++) {
      interleaved[i * 2] = l[i];
      interleaved[i * 2 + 1] = r[i];
    }
  } else {
    interleaved.set(buffer.getChannelData(0));
  }

  const dataLength = interleaved.length * 2;
  const arr = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arr);
  const write = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, bitDepth, true);
  write(36, "data");
  view.setUint32(40, dataLength, true);
  let offset = 44;
  for (let i = 0; i < interleaved.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, interleaved[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 直後の revoke はブラウザによってダウンロードを中断させる
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export const safeFilename = (name: string) =>
  name.replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, "_").slice(0, 64) || "mix";
