import { zipSync } from "fflate";
import type { ExportFormat } from "./export";
import { encodeMixdown } from "./export";

export type ZipEntry = { name: string; data: Uint8Array };

export const bufferToBytes = async (
  buffer: AudioBuffer,
  format: ExportFormat,
  mp3Kbps: number
): Promise<Uint8Array> => {
  const { blob } = encodeMixdown(buffer, format, mp3Kbps);
  return new Uint8Array(await blob.arrayBuffer());
};

export const downloadZip = (entries: ZipEntry[], filename: string) => {
  const files: Record<string, Uint8Array> = {};
  for (const e of entries) files[e.name] = e.data;
  const zipped = zipSync(files, { level: 0 });
  const blob = new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".zip") ? filename : `${filename}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
};
