import type { LayerAdjustments } from "../types/document";

/** 0–255 RGB にクランプ */
export const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

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

/** ImageData に明るさ・コントラスト・彩度・色相を適用 */
export const applyAdjustments = (src: ImageData, adj: LayerAdjustments): ImageData => {
  const out = new ImageData(src.width, src.height);
  const br = adj.brightness / 100;
  const ct = adj.contrast / 100;
  const sat = adj.saturation / 100;
  const hueShift = adj.hue;

  for (let i = 0; i < src.data.length; i += 4) {
    let r = src.data[i]!;
    let g = src.data[i + 1]!;
    let b = src.data[i + 2]!;
    const a = src.data[i + 3]!;

    r = clamp255((r - 128) * ct + 128);
    g = clamp255((g - 128) * ct + 128);
    b = clamp255((b - 128) * ct + 128);

    r = clamp255(r * br);
    g = clamp255(g * br);
    b = clamp255(b * br);

    let gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = clamp255(gray + (r - gray) * sat);
    g = clamp255(gray + (g - gray) * sat);
    b = clamp255(gray + (b - gray) * sat);

    if (hueShift !== 0) {
      const [h, s, l] = rgbToHsl(r, g, b);
      [r, g, b] = hslToRgb(h + hueShift, s, l);
    }

    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
    out.data[i + 3] = a;
  }
  return out;
};

/** プロンプトから決定論的シード値 */
export const hashPrompt = (prompt: string): number => {
  let h = 2166136261;
  for (let i = 0; i < prompt.length; i++) {
    h ^= prompt.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
