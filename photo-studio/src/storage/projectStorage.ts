import {
  defaultAdjustments,
  defaultTransform,
  type PhotoProject,
} from "../types/document";
import { getImageAsset, saveImageAsset } from "./imageAssets";

/** .pphoto ファイル形式（メタデータのみ、アセットは IndexedDB） */
export type ProjectFile = {
  version: number;
  project: PhotoProject;
};

export const serializeProject = (project: PhotoProject): string =>
  JSON.stringify({ version: 1, project }, null, 2);

export const deserializeProject = (json: ProjectFile): PhotoProject => ({
  ...json.project,
  layers: json.project.layers.map((l) => ({
    ...l,
    transform: { ...defaultTransform(), ...l.transform },
    adjustments: { ...defaultAdjustments(), ...l.adjustments },
  })),
});

export const downloadProject = (project: PhotoProject) => {
  const blob = new Blob([serializeProject(project)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${project.name || "project"}.pphoto`;
  a.click();
  URL.revokeObjectURL(a.href);
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
