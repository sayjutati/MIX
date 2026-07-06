export const PROJECT_VERSION = 1;

export type BlendMode = "normal" | "multiply" | "screen" | "overlay";

export type LayerAdjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  hue: number;
};

export const defaultAdjustments = (): LayerAdjustments => ({
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  hue: 0,
});

export type LayerTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
};

export const defaultTransform = (): LayerTransform => ({
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
});

/** ラスターレイヤー（画像・生成結果） */
export type RasterLayer = {
  id: string;
  name: string;
  kind: "raster";
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  /** IndexedDB 上の画像アセット ID */
  assetId: string;
  width: number;
  height: number;
  transform: LayerTransform;
  adjustments: LayerAdjustments;
};

/** 将来: テキスト・シェイプレイヤー */
export type Layer = RasterLayer;

export type CanvasPreset = {
  id: string;
  label: string;
  width: number;
  height: number;
};

export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: "1920x1080", label: "YouTube サムネ (16:9)", width: 1920, height: 1080 },
  { id: "1080x1080", label: "正方形 (1:1)", width: 1080, height: 1080 },
  { id: "1080x1920", label: "ショート縦 (9:16)", width: 1080, height: 1920 },
  { id: "1280x720", label: "HD (16:9)", width: 1280, height: 720 },
  { id: "800x800", label: "アイコン (800)", width: 800, height: 800 },
];

export type ExportFormat = "png" | "jpeg" | "webp";

export type ExportOptions = {
  quality?: number;
  transparent?: boolean;
};

export type PhotoProject = {
  id: string;
  version: number;
  name: string;
  createdAt: number;
  updatedAt: number;
  width: number;
  height: number;
  background: string;
  layers: Layer[];
};

export type EditorTab = "generate" | "adjust" | "layers" | "export";

export type GenerateParams = {
  prompt: string;
  width: number;
  height: number;
  seed: number;
  style: "photo" | "anime" | "illustration" | "abstract";
};

export const makeLayer = (
  partial: Partial<RasterLayer> & Pick<RasterLayer, "assetId" | "width" | "height">
): RasterLayer => ({
  id: `ly-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: "レイヤー",
  kind: "raster",
  visible: true,
  locked: false,
  opacity: 100,
  blendMode: "normal",
  transform: defaultTransform(),
  adjustments: defaultAdjustments(),
  ...partial,
});

export const makeProject = (partial?: Partial<PhotoProject>): PhotoProject => {
  const now = Date.now();
  return {
    id: `pp-${now}`,
    version: PROJECT_VERSION,
    name: "無題",
    createdAt: now,
    updatedAt: now,
    width: 1920,
    height: 1080,
    background: "#ffffff",
    layers: [],
    ...partial,
  };
};
