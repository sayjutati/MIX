import { makeAssetId, saveAudioAsset } from "../storage/audioAssetStorage";
import { makeAudioClip, type AudioClip, type Project } from "../types/project";
import { decodeAudioBlob } from "../audio/decode";
import { getAudioContext } from "../audio/engine";

export type ImportedAudio = {
  assetId: string;
  name: string;
  durationSec: number;
  clip: AudioClip;
};

const AUDIO_EXT = /\.(wav|mp3|ogg|m4a|flac|webm|aac)$/i;

export const isAudioFile = (file: File) =>
  file.type.startsWith("audio/") || AUDIO_EXT.test(file.name);

export async function importAudioFile(
  project: Project,
  file: File,
  startBeat = 0
): Promise<ImportedAudio> {
  const ctx = await getAudioContext();
  const buffer = await decodeAudioBlob(file, ctx);
  const assetId = makeAssetId();
  await saveAudioAsset(project.id, assetId, file, file.name, file.type || "audio/wav");
  const clip = makeAudioClip({
    assetId,
    name: file.name.replace(/\.[^.]+$/, ""),
    startBeat,
    trimStart: 0,
    durationSec: buffer.duration,
  });
  return { assetId, name: file.name, durationSec: buffer.duration, clip };
}

export async function importRecordedBlob(
  project: Project,
  blob: Blob,
  name: string,
  startBeat: number
): Promise<ImportedAudio> {
  const ctx = await getAudioContext();
  const buffer = await decodeAudioBlob(blob, ctx);
  const assetId = makeAssetId();
  await saveAudioAsset(project.id, assetId, blob, name, blob.type || "audio/webm");
  const clip = makeAudioClip({
    assetId,
    name,
    startBeat,
    trimStart: 0,
    durationSec: buffer.duration,
  });
  return { assetId, name, durationSec: buffer.duration, clip };
}

export const filterAudioFiles = (files: FileList | File[]): File[] =>
  Array.from(files).filter(isAudioFile);
