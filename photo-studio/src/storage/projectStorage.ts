import {
  defaultAdjustments,
  defaultTransform,
  type PhotoProject,
} from "../types/document";
import { downloadBlob } from "./download";
import { getImageAsset, putImageAsset, saveImageAsset } from "./imageAssets";

export type EmbeddedAsset = {
  name: string;
  mimeType: string;
  width: number;
  height: number;
  /** base64（data URL ではなく本体のみ） */
  data: string;
};

/**
 * .pphoto ファイル形式。
 * version 2 以降は画像本体を `assets` に埋め込む（他の端末・ブラウザでも開ける）。
 * version 1 はメタデータのみで、画像は同一ブラウザの IndexedDB に依存する。
 */
export type ProjectFile = {
  version: number;
  project: PhotoProject;
  assets?: Record<string, EmbeddedAsset>;
};

const FILE_VERSION = 2;

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
};
const base64ToBlob = (b64: string, type: string): Blob => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
};

export const serializeProject = async (project: PhotoProject): Promise<string> => {
  const assets: Record<string, EmbeddedAsset> = {};
  for (const layer of project.layers) {
    if (assets[layer.assetId]) continue;
    const rec = await getImageAsset(layer.assetId);
    if (!rec) continue;
    assets[layer.assetId] = {
      name: rec.name,
      mimeType: rec.mimeType,
      width: rec.width,
      height: rec.height,
      data: await blobToBase64(rec.blob),
    };
  }
  const file: ProjectFile = { version: FILE_VERSION, project, assets };
  return JSON.stringify(file);
};

export const parseProjectFile = (text: string): ProjectFile => {
  const json = JSON.parse(text) as Partial<ProjectFile> | null;
  if (!json || typeof json !== "object" || !json.project || !Array.isArray(json.project.layers)) {
    throw new Error("プロジェクトファイルの形式が正しくありません");
  }
  return json as ProjectFile;
};

/** 埋め込み画像を IndexedDB に復元する（同じ ID で上書き） */
export const restoreEmbeddedAssets = async (file: ProjectFile): Promise<void> => {
  if (!file.assets) return;
  for (const [id, a] of Object.entries(file.assets)) {
    await putImageAsset({
      id,
      projectId: file.project.id,
      name: a.name,
      mimeType: a.mimeType,
      blob: base64ToBlob(a.data, a.mimeType),
      width: a.width,
      height: a.height,
      createdAt: Date.now(),
    });
  }
};

export const deserializeProject = (json: ProjectFile): PhotoProject => ({
  ...json.project,
  layers: json.project.layers.map((l) => ({
    ...l,
    transform: { ...defaultTransform(), ...l.transform },
    adjustments: { ...defaultAdjustments(), ...l.adjustments },
  })),
});

export const downloadProject = async (project: PhotoProject) => {
  const blob = new Blob([await serializeProject(project)], { type: "application/json" });
  downloadBlob(blob, `${project.name || "project"}.pphoto`);
};
/** ファイルから画像を読み込みアセット化してレイヤー用 ID を返す */
export const importImageFile = async (
  projectId: string,
  file: File
): Promise<{ assetId: string; width: number; height: number; name: string }> => {
  const blob = file.type.startsWith("image/") ? file : new Blob([await file.arrayBuffer()], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  const dims = await new Promise<{ width: number; height: number }>((res, rej) => {
    const img = new Image();
    img.onload = () => res({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => rej(new Error("読み込み失敗"));
    img.src = url;
  });
  URL.revokeObjectURL(url);
  const assetId = await saveImageAsset(projectId, blob, file.name, dims.width, dims.height);
  return { assetId, ...dims, name: file.name.replace(/\.[^.]+$/, "") };
};

export const assetExists = async (assetId: string) => !!(await getImageAsset(assetId));
