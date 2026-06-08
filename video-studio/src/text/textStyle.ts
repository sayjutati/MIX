export type TextAlign = "left" | "center" | "right";

export type TextAnimKind =
  | "none"
  | "fade"
  | "slideUp"
  | "slideDown"
  | "slideLeft"
  | "slideRight"
  | "pop"
  | "typewriter"
  | "wipe"
  | "karaoke"
  /** 右→左に流れ続ける（クリップ長で終了） */
  | "scrollLeft"
  /** 左→右に流れ続ける */
  | "scrollRight"
  /** エンドロール風・下から上へ流れて停止位置で止まる */
  | "scrollUp"
  /** 上から下へ流れて停止 */
  | "scrollDown";

export const isScrollAnim = (k: TextAnimKind) =>
  k === "scrollLeft" || k === "scrollRight" || k === "scrollUp" || k === "scrollDown";

export interface TextStroke {
  enabled: boolean;
  color: string;
  width: number;
}

export interface TextShadow {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface TextBackground {
  enabled: boolean;
  color: string;
  opacity: number;
  paddingX: number;
  paddingY: number;
  radius: number;
}

export interface TextGradient {
  enabled: boolean;
  colorStart: string;
  colorEnd: string;
  angle: number;
}

export interface TextAnimation {
  in: TextAnimKind;
  out: TextAnimKind;
  /** 入り・スクロール完了までの秒（エンドロールの流れ時間） */
  inDuration: number;
  outDuration: number;
  /** 停止位置で止まって見せる秒（scrollUp/scrollDown） */
  holdDuration?: number;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  letterSpacing: number;
  lineHeight: number;
  textAlign: TextAlign;
  rotation: number;
  stroke: TextStroke;
  shadow: TextShadow;
  background: TextBackground;
  gradient: TextGradient;
  animation: TextAnimation;
}

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "Noto Sans JP（標準）", value: '"Noto Sans JP", sans-serif' },
  { label: "M PLUS Rounded（ポップ）", value: '"M PLUS Rounded 1c", sans-serif' },
  { label: "Zen Maru Gothic（丸ゴ）", value: '"Zen Maru Gothic", sans-serif' },
  { label: "Kosugi Maru", value: '"Kosugi Maru", sans-serif' },
  { label: "Dela Gothic One（極太）", value: '"Dela Gothic One", sans-serif' },
  { label: "Reggae One（個性派）", value: '"Reggae One", cursive' },
  { label: "RocknRoll One", value: '"RocknRoll One", sans-serif' },
  { label: "Inter（英字）", value: "Inter, sans-serif" },
];

export const defaultTextStyle = (): TextStyle => ({
  fontFamily: '"Noto Sans JP", sans-serif',
  fontSize: 48,
  fontWeight: 700,
  color: "#ffffff",
  letterSpacing: 0,
  lineHeight: 1.25,
  textAlign: "center",
  rotation: 0,
  stroke: { enabled: true, color: "#1a1a2e", width: 6 },
  shadow: { enabled: true, color: "rgba(0,0,0,0.55)", blur: 8, offsetX: 0, offsetY: 4 },
  background: { enabled: false, color: "#000000", opacity: 0.55, paddingX: 20, paddingY: 10, radius: 8 },
  gradient: { enabled: false, colorStart: "#ff6b9d", colorEnd: "#ffd93d", angle: 90 },
  animation: { in: "pop", out: "fade", inDuration: 0.45, outDuration: 0.35, holdDuration: 2 },
});

export const mergeTextStyle = (base: TextStyle, patch: Partial<TextStyle>): TextStyle => ({
  ...base,
  ...patch,
  stroke: { ...base.stroke, ...patch.stroke },
  shadow: { ...base.shadow, ...patch.shadow },
  background: { ...base.background, ...patch.background },
  gradient: { ...base.gradient, ...patch.gradient },
  animation: {
    ...base.animation,
    ...patch.animation,
    holdDuration: patch.animation?.holdDuration ?? base.animation.holdDuration ?? 2,
  },
});

/** v2 互換: 旧フィールドから style を組み立て */
export const textStyleFromLegacy = (legacy: {
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  style?: Partial<TextStyle>;
}): TextStyle => {
  const base = defaultTextStyle();
  if (legacy.style) return mergeTextStyle(base, legacy.style);
  return mergeTextStyle(base, {
    fontSize: legacy.fontSize ?? base.fontSize,
    color: legacy.color ?? base.color,
    fontFamily: legacy.fontFamily ?? base.fontFamily,
  });
};
