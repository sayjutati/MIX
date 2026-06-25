import { getDb } from "./projectStorage";

export type AudioAssetRecord = {
  id: string;
  projectId: string;
  name: string;
  mimeType: string;
  blob: Blob;
  createdAt: number;
};

const urlCache = new Map<string, string>();

export const makeAssetId = () => `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function saveAudioAsset(
  projectId: string,
  id: string,
  blob: Blob,
  name: string,
  mimeType: string
): Promise<void> {
  const db = await getDb();
  revokeAssetUrl(id);
  await db.put("audioAssets", {
    id,
    projectId,
    name,
    mimeType,
    blob,
    createdAt: Date.now(),
  });
}

export async function getAudioAsset(id: string): Promise<AudioAssetRecord | undefined> {
  const db = await getDb();
  return db.get("audioAssets", id);
}

export async function getAudioAssetBlob(id: string): Promise<Blob | null> {
  const rec = await getAudioAsset(id);
  return rec?.blob ?? null;
}

export async function getAudioAssetUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const blob = await getAudioAssetBlob(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export function revokeAssetUrl(id: string) {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}

export async function deleteProjectAssets(projectId: string): Promise<void> {
  const db = await getDb();
  const all = await db.getAllFromIndex("audioAssets", "by-project", projectId);
  for (const rec of all) {
    revokeAssetUrl(rec.id);
    await db.delete("audioAssets", rec.id);
  }
}

export async function listProjectAssets(projectId: string): Promise<AudioAssetRecord[]> {
  const db = await getDb();
  return db.getAllFromIndex("audioAssets", "by-project", projectId);
}
