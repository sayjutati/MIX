import type { TextStyle } from "./textStyle";
import { defaultTextStyle, mergeTextStyle } from "./textStyle";

export interface TelopPreset {
  id: string;
  name: string;
  description: string;
  sampleText: string;
  /** 0–1 正規化アンカー */
  x: number;
  y: number;
  duration: number;
  style: TextStyle;
}

const s = (patch: Partial<TextStyle>): TextStyle => mergeTextStyle(defaultTextStyle(), patch);

export const TELOP_PRESETS: TelopPreset[] = [
  {
    id: "song-title",
    name: "曲名・大タイトル",
    description: "OP 風の極太タイトル。中央やや上。",
    sampleText: "魔法のように",
    x: 0.5,
    y: 0.38,
    duration: 4,
    style: s({
      fontFamily: '"Dela Gothic One", sans-serif',
      fontSize: 72,
      fontWeight: 400,
      color: "#ffffff",
      letterSpacing: 2,
      stroke: { enabled: true, color: "#2d1b4e", width: 10 },
      shadow: { enabled: true, color: "rgba(120,60,200,0.6)", blur: 16, offsetX: 0, offsetY: 6 },
      gradient: { enabled: true, colorStart: "#ffffff", colorEnd: "#e8d4ff", angle: 180 },
      animation: { in: "pop", out: "fade", inDuration: 0.55, outDuration: 0.4 },
    }),
  },
  {
    id: "utaite-pop",
    name: "歌ってみた・ポップ",
    description: "ピンク〜イエローのグラデ＋ポップイン。",
    sampleText: "歌ってみた",
    x: 0.5,
    y: 0.5,
    duration: 3.5,
    style: s({
      fontFamily: '"M PLUS Rounded 1c", sans-serif',
      fontSize: 64,
      fontWeight: 800,
      color: "#ff6b9d",
      stroke: { enabled: true, color: "#ffffff", width: 8 },
      shadow: { enabled: true, color: "rgba(255,80,140,0.5)", blur: 20, offsetX: 0, offsetY: 4 },
      gradient: { enabled: true, colorStart: "#ff6b9d", colorEnd: "#ffd93d", angle: 90 },
      animation: { in: "slideUp", out: "slideDown", inDuration: 0.5, outDuration: 0.35 },
    }),
  },
  {
    id: "credit",
    name: "クレジット・出演",
    description: "下部の半透明帯＋フェード。",
    sampleText: "Vocal：あなたの名前\nMusic：原曲アーティスト",
    x: 0.5,
    y: 0.88,
    duration: 5,
    style: s({
      fontFamily: '"Zen Maru Gothic", sans-serif',
      fontSize: 28,
      fontWeight: 500,
      color: "#f0f0f5",
      lineHeight: 1.5,
      stroke: { enabled: false, color: "#000", width: 0 },
      shadow: { enabled: false, color: "#000", blur: 0, offsetX: 0, offsetY: 0 },
      background: { enabled: true, color: "#0a0a12", opacity: 0.72, paddingX: 28, paddingY: 14, radius: 6 },
      animation: { in: "fade", out: "fade", inDuration: 0.8, outDuration: 0.8 },
    }),
  },
  {
    id: "lyric-bottom",
    name: "歌詞・下部テロップ",
    description: "カラオケ風ワイプ。歌詞1行向け。",
    sampleText: "君の声が聴こえる",
    x: 0.5,
    y: 0.82,
    duration: 3,
    style: s({
      fontFamily: '"Noto Sans JP", sans-serif',
      fontSize: 42,
      fontWeight: 700,
      color: "#ffffff",
      stroke: { enabled: true, color: "#111827", width: 5 },
      shadow: { enabled: true, color: "rgba(0,0,0,0.45)", blur: 6, offsetX: 0, offsetY: 3 },
      animation: { in: "karaoke", out: "fade", inDuration: 2.5, outDuration: 0.3 },
    }),
  },
  {
    id: "lyric-typewriter",
    name: "歌詞・タイプライター",
    description: "1文字ずつ表示。シネマ風。",
    sampleText: "はじまりのメロディ",
    x: 0.5,
    y: 0.75,
    duration: 4,
    style: s({
      fontFamily: '"Noto Sans JP", sans-serif',
      fontSize: 36,
      fontWeight: 600,
      color: "#fef3c7",
      stroke: { enabled: true, color: "#422006", width: 3 },
      shadow: { enabled: true, color: "rgba(0,0,0,0.4)", blur: 4, offsetX: 0, offsetY: 2 },
      animation: { in: "typewriter", out: "fade", inDuration: 2.8, outDuration: 0.4 },
    }),
  },
  {
    id: "sabi-impact",
    name: "サビ・インパクト",
    description: "極太＋強い影。サビ入り向け。",
    sampleText: "届け！",
    x: 0.5,
    y: 0.45,
    duration: 2,
    style: s({
      fontFamily: '"Reggae One", cursive',
      fontSize: 88,
      fontWeight: 400,
      color: "#fef08a",
      stroke: { enabled: true, color: "#dc2626", width: 9 },
      shadow: { enabled: true, color: "rgba(220,38,38,0.65)", blur: 24, offsetX: 0, offsetY: 0 },
      animation: { in: "pop", out: "pop", inDuration: 0.35, outDuration: 0.25 },
    }),
  },
  {
    id: "notice-bar",
    name: "告知バー",
    description: "画面下部の帯テロップ。",
    sampleText: "※ イヤホン推奨 / 本編は 0:15 から",
    x: 0.5,
    y: 0.93,
    duration: 4,
    style: s({
      fontFamily: '"Kosugi Maru", sans-serif',
      fontSize: 24,
      fontWeight: 400,
      color: "#ffffff",
      background: { enabled: true, color: "#5b8def", opacity: 0.88, paddingX: 32, paddingY: 12, radius: 0 },
      stroke: { enabled: false, color: "#000", width: 0 },
      shadow: { enabled: false, color: "#000", blur: 0, offsetX: 0, offsetY: 0 },
      animation: { in: "slideUp", out: "slideDown", inDuration: 0.4, outDuration: 0.35 },
    }),
  },
  {
    id: "rock-title",
    name: "ロック・タイトル",
    description: "RocknRoll One + スライドイン。",
    sampleText: "ROCK YOUR VOICE",
    x: 0.5,
    y: 0.35,
    duration: 3,
    style: s({
      fontFamily: '"RocknRoll One", sans-serif',
      fontSize: 56,
      fontWeight: 400,
      color: "#f87171",
      letterSpacing: 4,
      stroke: { enabled: true, color: "#1f2937", width: 6 },
      shadow: { enabled: true, color: "rgba(0,0,0,0.5)", blur: 10, offsetX: 4, offsetY: 4 },
      animation: { in: "slideLeft", out: "slideRight", inDuration: 0.45, outDuration: 0.4 },
    }),
  },
];

export const getTelopPreset = (id: string) => TELOP_PRESETS.find((p) => p.id === id);
