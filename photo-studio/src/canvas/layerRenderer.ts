import type { Layer, PhotoProject } from "../types/document";
import { applyAdjustments } from "./pixelOps";

const imageCache = new Map<string, HTMLImageElement>();

export const loadImage = (url: string): Promise<HTMLImageElement> => {
  const hit = imageCache.get(url);
  if (hit?.complete) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    const img = hit ?? new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = url;
    imageCache.set(url, img);
  });
};

export const invalidateImage = (url: string) => imageCache.delete(url);

const cssBlend: Record<string, GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
};

export type RenderOptions = {
  skipBackground?: boolean;
};

/** 全レイヤーを合成してキャンバスに描画 */
export const renderProject = async (
  ctx: CanvasRenderingContext2D,
  project: PhotoProject,
  assetUrl: (id: string) => string | null,
  options?: RenderOptions
) => {
  const { width, height } = project;
  ctx.clearRect(0, 0, width, height);
  if (!options?.skipBackground) {
    ctx.fillStyle = project.background;
    ctx.fillRect(0, 0, width, height);
  }

  for (const layer of project.layers) {
    if (!layer.visible) continue;
    await drawLayer(ctx, layer, project, assetUrl);
  }
};

/** 単一レイヤーを描画（サムネイル用） */
export const renderLayer = async (
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  project: PhotoProject,
  assetUrl: (id: string) => string | null
) => {
  ctx.clearRect(0, 0, project.width, project.height);
  if (layer.visible) await drawLayer(ctx, layer, project, assetUrl);
};

const drawLayer = async (
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  project: PhotoProject,
  assetUrl: (id: string) => string | null
) => {
  const url = assetUrl(layer.assetId);
  if (!url) return;

  const img = await loadImage(url);
  const { transform, adjustments, opacity, blendMode } = layer;

  const off = document.createElement("canvas");
  off.width = layer.width;
  off.height = layer.height;
  const octx = off.getContext("2d");
  if (!octx) return;

  if (adjustments.blur > 0) {
    octx.filter = `blur(${adjustments.blur}px)`;
  }
  octx.drawImage(img, 0, 0, layer.width, layer.height);
  octx.filter = "none";

  const adjusted = applyAdjustments(
    octx.getImageData(0, 0, layer.width, layer.height),
    adjustments
  );
  octx.putImageData(adjusted, 0, 0);

  ctx.save();
  ctx.globalAlpha = opacity / 100;
  ctx.globalCompositeOperation = cssBlend[blendMode] ?? "source-over";

  const cx = project.width / 2 + transform.x;
  const cy = project.height / 2 + transform.y;
  ctx.translate(cx, cy);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(
    transform.scale * (transform.flipX ? -1 : 1),
    transform.scale * (transform.flipY ? -1 : 1)
  );
  ctx.drawImage(off, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
  ctx.restore();
};

/** 合成結果を Blob に書き出し */
export const canvasToBlob = (
  canvas: HTMLCanvasElement,
  format: "png" | "jpeg" | "webp",
  quality = 0.92
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const mime =
      format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg";
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("書き出しに失敗しました"))),
      mime,
      quality
    );
  });

export const downloadBlob = (blob: Blob, filename: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};
