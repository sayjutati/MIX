import type { GenerateParams } from "../types/document";
import { hashPrompt } from "../canvas/pixelOps";

export type GenerateResult = {
  blob: Blob;
  width: number;
  height: number;
  seed: number;
  providerId: string;
};

export type GenerationProvider = {
  id: string;
  name: string;
  description: string;
  requiresApiKey: boolean;
  generate: (params: GenerateParams) => Promise<GenerateResult>;
};

type Rng = () => number;

type Palette = {
  sky: number[];
  ground: number[];
  accent: number;
  sat: number;
  light: number;
};

const KEYWORDS: { keys: string[]; sky: number[]; ground: number[]; accent: number; sat?: number; light?: number }[] = [
  { keys: ["夕焼", "夕日", "sunset", "dusk", "golden"], sky: [18, 28, 8], ground: [20, 12, 6], accent: 38, sat: 0.72, light: 0.48 },
  { keys: ["夜", "night", "星", "star", "moon", "月"], sky: [230, 250, 220], ground: [240, 220, 210], accent: 48, sat: 0.45, light: 0.22 },
  { keys: ["海", "ocean", "sea", "beach", "波", "青"], sky: [198, 210, 190], ground: [200, 185, 32], accent: 45, sat: 0.55, light: 0.5 },
  { keys: ["森", "forest", "緑", "green", "山", "mountain"], sky: [195, 170, 140], ground: [120, 95, 80], accent: 45, sat: 0.5, light: 0.42 },
  { keys: ["桜", "sakura", "pink", "春", "blossom"], sky: [330, 210, 20], ground: [340, 20, 15], accent: 350, sat: 0.48, light: 0.62 },
  { keys: ["紫", "fantasy", "幻想", "neon", "cyber"], sky: [270, 290, 250], ground: [280, 260, 220], accent: 320, sat: 0.65, light: 0.4 },
  { keys: ["雪", "snow", "冬", "winter", "白"], sky: [210, 200, 220], ground: [210, 200, 0], accent: 200, sat: 0.18, light: 0.78 },
  { keys: ["都市", "city", "neon", "tokyo"], sky: [230, 260, 20], ground: [240, 20, 10], accent: 320, sat: 0.55, light: 0.28 },
  { keys: ["サムネ", "thumbnail", "歌ってみた", "cover"], sky: [280, 320, 30], ground: [260, 20, 15], accent: 45, sat: 0.7, light: 0.42 },
];

const mulberry32 = (a: number): Rng => {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const hsl = (h: number, s: number, l: number, a = 1) =>
  a < 1 ? `hsla(${h},${s * 100}%,${l * 100}%,${a})` : `hsl(${h},${s * 100}%,${l * 100}%)`;

const paletteFromPrompt = (prompt: string, style: GenerateParams["style"], rng: Rng): Palette => {
  const p = prompt.toLowerCase();
  let sky = [210, 200, 30];
  let ground = [30, 25, 20];
  let accent = 45;
  let sat = 0.55;
  let light = 0.45;
  let hits = 0;
  for (const k of KEYWORDS) {
    if (k.keys.some((key) => p.includes(key))) {
      sky = k.sky;
      ground = k.ground;
      accent = k.accent;
      sat = k.sat ?? sat;
      light = k.light ?? light;
      hits++;
    }
  }
  if (hits === 0) {
    sky = [Math.floor(rng() * 360), Math.floor(rng() * 360), Math.floor(rng() * 360)];
    ground = [sky[0]! + 20, sky[1]! - 30, 25];
    accent = (sky[0]! + 140) % 360;
  }
  if (style === "photo") {
    sat *= 0.75;
    light = light * 0.9 + 0.08;
  } else if (style === "anime") {
    sat = Math.min(0.85, sat + 0.18);
    light += 0.06;
  } else if (style === "illustration") {
    sat = Math.min(0.7, sat + 0.05);
  } else {
    sat = Math.min(0.9, sat + 0.1);
    sky = sky.map((h) => (h + rng() * 40) % 360);
  }
  return { sky, ground, accent, sat, light };
};

const fillNoise = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: Rng,
  alpha: number
) => {
  const step = Math.max(2, Math.floor(Math.min(w, h) / 180));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const n = rng();
      ctx.fillStyle = `rgba(255,255,255,${n * alpha})`;
      ctx.fillRect(x, y, step, step);
    }
  }
};

const blobShape = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rng: Rng
) => {
  ctx.beginPath();
  const n = 6 + Math.floor(rng() * 4);
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const jx = 0.75 + rng() * 0.45;
    const jy = 0.75 + rng() * 0.45;
    const x = cx + Math.cos(t) * rx * jx;
    const y = cy + Math.sin(t) * ry * jy;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
};

const drawTitle = (
  ctx: CanvasRenderingContext2D,
  prompt: string,
  w: number,
  h: number,
  style: GenerateParams["style"]
) => {
  const line = prompt.split(/[、。,.!！？\n]/)[0]?.trim() || prompt.trim();
  if (!line) return;
  const maxW = w * 0.82;
  let size = Math.min(h * 0.11, w / Math.max(8, line.length * 0.7));
  size = Math.max(28, size);
  ctx.font = `800 ${size}px "Noto Sans JP","Segoe UI",system-ui,sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  while (ctx.measureText(line).width > maxW && size > 18) {
    size -= 2;
    ctx.font = `800 ${size}px "Noto Sans JP","Segoe UI",system-ui,sans-serif`;
  }
  const x = w / 2;
  const y = style === "photo" ? h * 0.78 : h * 0.72;
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.fillRect(x - maxW / 2 - 16, y - size * 0.7, maxW + 32, size * 1.45);
  ctx.lineWidth = Math.max(4, size / 10);
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.strokeText(line.slice(0, 28), x, y);
  ctx.fillStyle = "#fff";
  ctx.fillText(line.slice(0, 28), x, y);
};

const renderScene = (
  ctx: CanvasRenderingContext2D,
  params: GenerateParams,
  rng: Rng,
  pal: Palette
) => {
  const { width: w, height: h, style, prompt } = params;
  const horizon = 0.42 + rng() * 0.22;

  const sky = ctx.createLinearGradient(0, 0, 0, h * horizon);
  sky.addColorStop(0, hsl(pal.sky[0]!, pal.sat, Math.min(0.88, pal.light + 0.28)));
  sky.addColorStop(0.55, hsl(pal.sky[1]!, pal.sat * 0.9, pal.light));
  sky.addColorStop(1, hsl(pal.sky[2]!, pal.sat * 0.8, pal.light * 0.7));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const ground = ctx.createLinearGradient(0, h * horizon, 0, h);
  ground.addColorStop(0, hsl(pal.ground[0]!, pal.sat * 0.7, pal.light * 0.55));
  ground.addColorStop(1, hsl(pal.ground[1]!, pal.sat * 0.5, pal.light * 0.22));
  ctx.fillStyle = ground;
  ctx.fillRect(0, h * horizon, w, h * (1 - horizon));

  ctx.globalCompositeOperation = "screen";
  const glow = ctx.createRadialGradient(w * 0.7, h * (horizon - 0.12), 10, w * 0.7, h * (horizon - 0.12), w * 0.45);
  glow.addColorStop(0, hsl(pal.accent, 0.85, 0.7, 0.55));
  glow.addColorStop(1, hsl(pal.accent, 0.5, 0.4, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";

  const layers = style === "abstract" ? 18 : 9;
  for (let i = 0; i < layers; i++) {
    const z = i / layers;
    ctx.globalAlpha = 0.12 + z * 0.22;
    ctx.fillStyle = hsl((pal.accent + i * 18) % 360, pal.sat, pal.light * (0.4 + z * 0.4));
    blobShape(
      ctx,
      rng() * w,
      h * (horizon - 0.15 + z * 0.55),
      w * (0.08 + rng() * 0.28),
      h * (0.04 + rng() * 0.16),
      rng
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (style === "anime") {
    ctx.globalCompositeOperation = "overlay";
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = hsl(pal.sky[i % pal.sky.length]!, 0.7, 0.65, 0.35);
      ctx.beginPath();
      ctx.ellipse(rng() * w, h * 0.18 + rng() * h * 0.2, w * 0.18, h * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  if (style === "photo" || /夜|star|星/.test(prompt)) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 40; i++) {
      ctx.globalAlpha = 0.2 + rng() * 0.7;
      ctx.fillRect(rng() * w, rng() * h * horizon * 0.85, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  }

  fillNoise(ctx, w, h, rng, style === "photo" ? 0.07 : 0.04);

  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.15, w / 2, h / 2, h * 0.75);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  drawTitle(ctx, prompt, w, h, style);
};

export const localCanvasProvider: GenerationProvider = {
  id: "local-canvas",
  name: "シーン生成",
  description: "プロンプトの雰囲気からサムネ用アートを合成（API 不要）",
  requiresApiKey: false,
  async generate(params) {
    const seed = params.seed || hashPrompt(params.prompt);
    const { width, height } = params;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const rng = mulberry32(seed);
    const pal = paletteFromPrompt(params.prompt, params.style, rng);
    renderScene(ctx, params, rng, pal);

    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("生成失敗"))), "image/png")
    );
    return { blob, width, height, seed, providerId: "local-canvas" };
  },
};

export const GENERATION_PROVIDERS: GenerationProvider[] = [localCanvasProvider];

export const getProvider = (id: string) => GENERATION_PROVIDERS.find((p) => p.id === id);
