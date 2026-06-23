import { Mp3Encoder } from "lamejs";

export type ExportFormat = "wav" | "mp3";

const MP3_BLOCK_SIZE = 1152;

const floatTo16BitPCM = (input: Float32Array): Int16Array => {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
};

export const audioBufferToMp3 = (buffer: AudioBuffer, kbps = 192): Blob => {
  const channels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const encoder = new Mp3Encoder(channels, sampleRate, kbps);
  const left = buffer.getChannelData(0);
  const right = channels > 1 ? buffer.getChannelData(1) : left;
  const chunks: Int8Array[] = [];

  for (let i = 0; i < left.length; i += MP3_BLOCK_SIZE) {
    const leftChunk = floatTo16BitPCM(left.subarray(i, i + MP3_BLOCK_SIZE));
    const encoded =
      channels === 1
        ? encoder.encodeBuffer(leftChunk)
        : encoder.encodeBuffer(leftChunk, floatTo16BitPCM(right.subarray(i, i + MP3_BLOCK_SIZE)));
    if (encoded.length > 0) chunks.push(encoded);
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);
  return new Blob(chunks, { type: "audio/mpeg" });
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
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

export const safeFilename = (name: string) =>
  name.replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, "_").slice(0, 64) || "mix";
