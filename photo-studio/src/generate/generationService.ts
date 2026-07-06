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
  /** 外部 API キーが必要か */
  requiresApiKey: boolean;
  generate: (params: GenerateParams) => Promise<GenerateResult>;
};

/** 決定論的ローカル生成（API なしで動作確認・プロトタイプ用） */
export const localCanvasProvider: GenerationProvider = {
  id: "local-canvas",
  name: "ローカル生成",
  description: "ブラウザ内でプロンプトに基づく抽象アートを生成（API 不要）",
  requiresApiKey: false,
  async generate(params) {
    const seed = params.seed || hashPrompt(params.prompt);
    const { width, height, style } = params;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    const rng = mulberry32(seed);
    const hues = styleHues(style, rng);

    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, hsl(hues[0], 0.55, 0.45));
    g.addColorStop(0.5, hsl(hues[1], 0.6, 0.35));
    g.addColorStop(1, hsl(hues[2], 0.5, 0.5));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    const n = 12 + Math.floor(rng() * 20);
    for (let i = 0; i < n; i++) {
      const x = rng() * width;
      const y = rng() * height;
      const r = 20 + rng() * Math.min(width, height) * 0.35;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = hsl(hues[i % hues.length]!, 0.5 + rng() * 0.3, 0.4 + rng() * 0.3, 0.15 + rng() * 0.35);
      ctx.fill();
    }

    if (params.prompt.trim()) {
      ctx.font = `600 ${Math.max(14, width / 40)}px system-ui,sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.textAlign = "center";
      ctx.fillText(params.prompt.slice(0, 48), width / 2, height * 0.92);
    }

    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("生成失敗"))), "image/png")
    );
    return { blob, width, height, seed, providerId: "local-canvas" };
  },
};

/** 将来: OpenAI / Stability / Replicate 等をここに追加 */
export const GENERATION_PROVIDERS: GenerationProvider[] = [localCanvasProvider];

export const getProvider = (id: string) => GENERATION_PROVIDERS.find((p) => p.id === id);

const mulberry32 = (a: number) => {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const styleHues = (style: GenerateParams["style"], rng: () => number): number[] => {
  const base: Record<GenerateParams["style"], number[]> = {
    photo: [210, 220, 200],
    anime: [280, 320, 260],
    illustration: [30, 45, 15],
    abstract: [hashToHue(rng()), hashToHue(rng()), hashToHue(rng())],
  };
  return base[style];
};

const hashToHue = (v: number) => Math.floor(v * 360);

const hsl = (h: number, s: number, l: number, a = 1) =>
  a < 1 ? `hsla(${h},${s * 100}%,${l * 100}%,${a})` : `hsl(${h},${s * 100}%,${l * 100}%)`;
