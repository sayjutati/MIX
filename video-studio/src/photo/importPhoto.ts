import type { MediaAsset } from "../types";

interface PPhotoAdjustments {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  blur?: number;
  hue?: number;
}

interface PPhotoTransform {
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
}

interface PPhotoLayer {
  id: string;
  name?: string;
  visible?: boolean;
  opacity?: number;
  blendMode?: "normal" | "multiply" | "screen" | "overlay";
  assetId: string;
  width: number;
  height: number;
  transform?: PPhotoTransform;
  adjustments?: PPhotoAdjustments;
}

interface PPhotoEmbeddedAsset {
  name: string;
  mimeType: string;
  width: number;
  height: number;
  data: string;
}

export interface PPhotoFile {
  version?: number;
  project?: {
    id?: string;
    name?: string;
    width?: number;
    height?: number;
    background?: string;
    layers?: PPhotoLayer[];
  };
  assets?: Record<string, PPhotoEmbeddedAsset>;
}

const cssBlend: Record<string, GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
};

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
};

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  h = ((h % 360) + 360) % 360;
  if (s === 0) {
    const v = clamp255(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = h / 360;
  const t2rgb = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [
    clamp255(t2rgb(hue + 1 / 3) * 255),
    clamp255(t2rgb(hue) * 255),
    clamp255(t2rgb(hue - 1 / 3) * 255),
  ];
};

const applyPixelAdjustments = (imgData: ImageData, adj?: PPhotoAdjustments): ImageData => {
  const br = (adj?.brightness ?? 100) / 100;
  const ct = (adj?.contrast ?? 100) / 100;
  const sat = (adj?.saturation ?? 100) / 100;
  const hueShift = adj?.hue ?? 0;
  if (br === 1 && ct === 1 && sat === 1 && hueShift === 0) return imgData;

  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]!;
    let g = data[i + 1]!;
    let b = data[i + 2]!;

    r = clamp255((r - 128) * ct + 128);
    g = clamp255((g - 128) * ct + 128);
    b = clamp255((b - 128) * ct + 128);

    r = clamp255(r * br);
    g = clamp255(g * br);
    b = clamp255(b * br);

    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = clamp255(gray + (r - gray) * sat);
    g = clamp255(gray + (g - gray) * sat);
    b = clamp255(gray + (b - gray) * sat);

    if (hueShift !== 0) {
      const [h, s, l] = rgbToHsl(r, g, b);
      [r, g, b] = hslToRgb(h + hueShift, s, l);
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  return imgData;
};

export const base64ToBlob = (b64: string, mimeType: string): Blob => {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || "image/png" });
};

const loadBlobImage = (blob: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("レイヤー画像のデコードに失敗しました"));
    };
    img.src = url;
  });

export const parsePPhotoJson = (text: string): PPhotoFile => {
  const json = JSON.parse(text.replace(/^\uFEFF/, "")) as PPhotoFile | null;
  if (!json || typeof json !== "object" || !json.project || !Array.isArray(json.project.layers)) {
    throw new Error(".pphoto ファイルの形式が正しくありません");
  }
  return json;
};

/**
 * Photo Studio の .pphoto ファイルを透過 PNG MediaAsset に合成して返す。
 * Photo Studio の「Video へ送る」と同じく透過背景でレイヤーを合成するため、
 * サムネイルも透過オーバーレイ枠もそのままタイムラインに配置できる。
 */
export const importPPhotoFile = async (file: File): Promise<MediaAsset> => {
  const parsed = parsePPhotoJson(await file.text());
  const proj = parsed.project!;
  const width = Math.max(1, Math.round(proj.width || 1920));
  const height = Math.max(1, Math.round(proj.height || 1080));
  const visibleLayers = (proj.layers ?? []).filter((l) => l.visible !== false);
  if (visibleLayers.length === 0) {
    throw new Error(".pphoto 内に表示可能なレイヤーがありません");
  }

  const assets = parsed.assets ?? {};
  const missingAll = visibleLayers.every((l) => !assets[l.assetId]?.data);
  if (missingAll) {
    throw new Error(
      "この .pphoto には画像本体が埋め込まれていません。Photo Studio で保存し直すか「Video へ送る」を使ってください"
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("キャンバスの初期化に失敗しました");

  for (const layer of visibleLayers) {
    const embedded = assets[layer.assetId];
    if (!embedded?.data) continue;
    const blob = base64ToBlob(embedded.data, embedded.mimeType || "image/png");
    const img = await loadBlobImage(blob);

    const lw = Math.max(1, Math.round(layer.width || img.naturalWidth || width));
    const lh = Math.max(1, Math.round(layer.height || img.naturalHeight || height));

    const off = document.createElement("canvas");
    off.width = lw;
    off.height = lh;
    const octx = off.getContext("2d");
    if (!octx) continue;

    const blur = layer.adjustments?.blur ?? 0;
    if (blur > 0) octx.filter = `blur(${blur}px)`;
    octx.drawImage(img, 0, 0, lw, lh);
    octx.filter = "none";

    const adjusted = applyPixelAdjustments(octx.getImageData(0, 0, lw, lh), layer.adjustments);
    octx.putImageData(adjusted, 0, 0);

    const tf = layer.transform ?? {};
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, (layer.opacity ?? 100) / 100));
    ctx.globalCompositeOperation = cssBlend[layer.blendMode ?? "normal"] ?? "source-over";
    ctx.translate(width / 2 + (tf.x ?? 0), height / 2 + (tf.y ?? 0));
    ctx.rotate(((tf.rotation ?? 0) * Math.PI) / 180);
    ctx.scale(
      (tf.scale ?? 1) * (tf.flipX ? -1 : 1),
      (tf.scale ?? 1) * (tf.flipY ? -1 : 1)
    );
    ctx.drawImage(off, -lw / 2, -lh / 2, lw, lh);
    ctx.restore();
  }

  const outBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(".pphoto の画像変換に失敗しました"))),
      "image/png"
    );
  });

  const url = URL.createObjectURL(outBlob);
  const baseName = (proj.name || file.name.replace(/\.pphoto$/i, "") || "Photo画像").trim();
  return {
    id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `${baseName}.png`,
    kind: "image",
    mimeType: "image/png",
    url,
    duration: 5,
    width,
    height,
  };
};
