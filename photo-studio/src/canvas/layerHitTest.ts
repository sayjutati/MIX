import type { Layer, PhotoProject } from "../types/document";

/** レイヤー中心を基準にしたローカル座標へ変換 */
export const canvasToLayerLocal = (
  project: PhotoProject,
  layer: Layer,
  px: number,
  py: number
): { x: number; y: number } => {
  const cx = project.width / 2 + layer.transform.x;
  const cy = project.height / 2 + layer.transform.y;
  let lx = px - cx;
  let ly = py - cy;
  const rad = (-layer.transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = lx * cos - ly * sin;
  const ry = lx * sin + ly * cos;
  const sx = layer.transform.flipX ? -rx : rx;
  const sy = layer.transform.flipY ? -ry : ry;
  return {
    x: sx / layer.transform.scale,
    y: sy / layer.transform.scale,
  };
};

export const pointInLayer = (
  project: PhotoProject,
  layer: Layer,
  px: number,
  py: number
): boolean => {
  const { x, y } = canvasToLayerLocal(project, layer, px, py);
  return (
    x >= -layer.width / 2 &&
    x <= layer.width / 2 &&
    y >= -layer.height / 2 &&
    y <= layer.height / 2
  );
};

/** 最前面のヒットレイヤー ID を返す */
export const hitTestLayer = (
  project: PhotoProject,
  px: number,
  py: number
): string | null => {
  for (let i = project.layers.length - 1; i >= 0; i--) {
    const layer = project.layers[i]!;
    if (!layer.visible || layer.locked) continue;
    if (pointInLayer(project, layer, px, py)) return layer.id;
  }
  return null;
};

/** スクリーン座標 → キャンバス座標（getBoundingClientRect ベース） */
export const clientToCanvas = (
  clientX: number,
  clientY: number,
  rect: DOMRect,
  canvasW: number,
  canvasH: number
): { x: number; y: number } => ({
  x: ((clientX - rect.left) / rect.width) * canvasW,
  y: ((clientY - rect.top) / rect.height) * canvasH,
});
