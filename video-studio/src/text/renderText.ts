import type { TextClip } from "../types";
import { clipOpacityAt } from "../types";
import { isScrollAnim, type TextStyle } from "./textStyle";

export interface TextBounds {
  left: number;
  top: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

export interface TelopTransform {
  opacity: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  reveal: number;
  visibleText: string;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInCubic = (t: number) => t ** 3;
const easeOutBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

const fontCss = (style: TextStyle) =>
  `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;

const linesOf = (text: string) => text.split("\n");

export const computeTelopTransform = (
  clip: TextClip,
  localSec: number,
  w: number,
  h: number,
  blockSize?: { width: number; height: number }
): TelopTransform => {
  const anim = clip.style.animation;
  const dur = clip.duration;
  let opacity = clipOpacityAt(clip, localSec) / 100;
  let offsetX = 0;
  let offsetY = 0;
  let scale = 1;
  let reveal = 1;
  let visibleText = clip.text;

  const blockW = blockSize?.width ?? 240;
  const blockH = blockSize?.height ?? 80;
  const holdDur = anim.holdDuration ?? 2;
  const scrollDur = Math.max(0.1, anim.inDuration || dur * 0.65);
  const outStart = dur - anim.outDuration;

  if (anim.in === "scrollLeft" || anim.in === "scrollRight") {
    const runEnd = anim.outDuration > 0 ? outStart : dur;
    const travel = w + blockW;
    const p = runEnd > 0 ? Math.min(1, Math.max(0, localSec / runEnd)) : 1;
    if (anim.in === "scrollLeft") {
      offsetX = w * 0.5 + blockW * 0.5 - p * travel;
    } else {
      offsetX = -(w * 0.5 + blockW * 0.5) + p * travel;
    }
    if (localSec < 0.35) opacity *= Math.min(1, localSec / 0.35);
  } else if (anim.in === "scrollUp" || anim.in === "scrollDown") {
    const holdEnd = scrollDur + holdDur;
    if (localSec < scrollDur) {
      const p = easeOutCubic(localSec / scrollDur);
      if (anim.in === "scrollUp") {
        const startOff = h - clip.y * h + blockH * 0.55;
        offsetY = startOff * (1 - p);
      } else {
        const startOff = -(clip.y * h + blockH * 0.55);
        offsetY = startOff * (1 - p);
      }
      if (localSec < 0.4) opacity *= Math.min(1, localSec / 0.4);
    } else if (localSec < holdEnd) {
      offsetY = 0;
    }
  }

  const applyIn = (kind: typeof anim.in, p: number) => {
    const e = easeOutCubic(Math.min(1, Math.max(0, p)));
    switch (kind) {
      case "fade":
        opacity *= e;
        break;
      case "slideUp":
        offsetY += (1 - e) * 48;
        opacity *= e;
        break;
      case "slideDown":
        offsetY -= (1 - e) * 48;
        opacity *= e;
        break;
      case "slideLeft":
        offsetX += (1 - e) * 64;
        opacity *= e;
        break;
      case "slideRight":
        offsetX -= (1 - e) * 64;
        opacity *= e;
        break;
      case "pop":
        scale = 0.3 + easeOutBack(e) * 0.7;
        opacity *= e;
        break;
      case "typewriter": {
        const chars = Math.floor(clip.text.length * easeOutCubic(p));
        visibleText = clip.text.slice(0, chars);
        opacity *= Math.min(1, p * 2);
        break;
      }
      case "wipe":
      case "karaoke":
        reveal = e;
        opacity *= Math.min(1, 0.2 + e * 0.8);
        break;
      default:
        break;
    }
  };

  const applyOut = (kind: typeof anim.out, p: number) => {
    const e = easeInCubic(Math.min(1, Math.max(0, p)));
    switch (kind) {
      case "fade":
        opacity *= 1 - e;
        break;
      case "slideUp":
        offsetY -= e * 40;
        opacity *= 1 - e;
        break;
      case "slideDown":
        offsetY += e * 40;
        opacity *= 1 - e;
        break;
      case "slideLeft":
        offsetX -= e * 56;
        opacity *= 1 - e;
        break;
      case "slideRight":
        offsetX += e * 56;
        opacity *= 1 - e;
        break;
      case "pop":
        scale *= 1 - e * 0.35;
        opacity *= 1 - e;
        break;
      default:
        break;
    }
  };

  const skipClassicIn = isScrollAnim(anim.in);

  if (
    !skipClassicIn &&
    anim.in !== "none" &&
    anim.inDuration > 0 &&
    localSec < anim.inDuration
  ) {
    applyIn(anim.in, localSec / anim.inDuration);
  } else if (anim.in === "typewriter" && anim.inDuration > 0 && localSec < anim.inDuration) {
    applyIn("typewriter", localSec / anim.inDuration);
  } else if (
    (anim.in === "wipe" || anim.in === "karaoke") &&
    anim.inDuration > 0 &&
    localSec < anim.inDuration
  ) {
    applyIn(anim.in, localSec / anim.inDuration);
  } else if (anim.in === "typewriter") {
    visibleText = clip.text;
  }

  const timeToEnd = dur - localSec;
  if (anim.out !== "none" && anim.outDuration > 0 && timeToEnd < anim.outDuration) {
    applyOut(anim.out, 1 - timeToEnd / anim.outDuration);
  }

  return { opacity, offsetX, offsetY, scale, reveal, visibleText };
};

export const measureTextBlock = (
  ctx: CanvasRenderingContext2D,
  text: string,
  style: TextStyle
): { width: number; height: number; lineWidths: number[] } => {
  ctx.save();
  ctx.font = fontCss(style);
  const lines = linesOf(text);
  const lineH = style.fontSize * style.lineHeight;
  const lineWidths = lines.map((line) => {
    let w = 0;
    for (const ch of line) {
      w += ctx.measureText(ch).width + style.letterSpacing;
    }
    return Math.max(0, w - style.letterSpacing);
  });
  const width = Math.max(...lineWidths, 0);
  const height = lines.length * lineH;
  ctx.restore();
  return { width, height, lineWidths };
};

const gradientFill = (
  ctx: CanvasRenderingContext2D,
  style: TextStyle,
  x: number,
  y: number,
  w: number,
  h: number
) => {
  const rad = (style.gradient.angle * Math.PI) / 180;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const len = Math.max(w, h);
  const g = ctx.createLinearGradient(
    cx - Math.cos(rad) * len,
    cy - Math.sin(rad) * len,
    cx + Math.cos(rad) * len,
    cy + Math.sin(rad) * len
  );
  g.addColorStop(0, style.gradient.colorStart);
  g.addColorStop(1, style.gradient.colorEnd);
  return g;
};

const drawLine = (
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  style: TextStyle,
  blockW: number
) => {
  let startX = x;
  if (style.textAlign === "center") startX = x + blockW / 2;
  else if (style.textAlign === "right") startX = x + blockW;

  ctx.textAlign = style.textAlign;
  ctx.textBaseline = "middle";

  const drawChars = (fill: CanvasGradient | string, stroke?: boolean) => {
    if (style.letterSpacing === 0) {
      if (stroke && style.stroke.enabled) {
        ctx.strokeStyle = style.stroke.color;
        ctx.lineWidth = style.stroke.width;
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.strokeText(line, startX, y);
      }
      ctx.fillStyle = fill;
      ctx.fillText(line, startX, y);
      return;
    }
    let cx = startX;
    if (style.textAlign === "center") cx -= measureLineWidth(ctx, line, style) / 2;
    else if (style.textAlign === "right") cx -= measureLineWidth(ctx, line, style);
    for (const ch of line) {
      if (stroke && style.stroke.enabled) {
        ctx.strokeStyle = style.stroke.color;
        ctx.lineWidth = style.stroke.width;
        ctx.strokeText(ch, cx, y);
      }
      ctx.fillStyle = fill;
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + style.letterSpacing;
    }
  };

  const fill = style.gradient.enabled
    ? gradientFill(ctx, style, x, y - style.fontSize / 2, blockW, style.fontSize)
    : style.color;

  if (style.stroke.enabled) drawChars(fill, true);
  else drawChars(fill);
};

const measureLineWidth = (ctx: CanvasRenderingContext2D, line: string, style: TextStyle) => {
  let w = 0;
  for (const ch of line) w += ctx.measureText(ch).width + style.letterSpacing;
  return Math.max(0, w - style.letterSpacing);
};

export const getTelopBounds = (
  ctx: CanvasRenderingContext2D,
  clip: TextClip,
  localSec: number,
  w: number,
  h: number
): TextBounds => {
  const style = clip.style;
  ctx.save();
  ctx.font = fontCss(style);
  const preText = clip.text;
  const { width, height } = measureTextBlock(ctx, preText || " ", style);
  const tr = computeTelopTransform(clip, localSec, w, h, { width, height });
  const { width: tw, height: th } = measureTextBlock(ctx, tr.visibleText || " ", style);
  const padX = style.background.enabled ? style.background.paddingX : 0;
  const padY = style.background.enabled ? style.background.paddingY : 0;
  const boxW = tw + padX * 2;
  const boxH = th + padY * 2;
  const anchorX = clip.x * w + tr.offsetX;
  const anchorY = clip.y * h + tr.offsetY;
  let left = anchorX - boxW / 2;
  if (style.textAlign === "left") left = anchorX - padX;
  else if (style.textAlign === "right") left = anchorX - boxW + padX;
  const top = anchorY - boxH / 2;
  ctx.restore();
  return { left, top, width: boxW, height: boxH, anchorX, anchorY };
};

export const hitTestTelop = (
  ctx: CanvasRenderingContext2D,
  clip: TextClip,
  localSec: number,
  w: number,
  h: number,
  px: number,
  py: number
): boolean => {
  const b = getTelopBounds(ctx, clip, localSec, w, h);
  const margin = 8;
  return (
    px >= b.left - margin &&
    px <= b.left + b.width + margin &&
    py >= b.top - margin &&
    py <= b.top + b.height + margin
  );
};

export const drawTelop = (
  ctx: CanvasRenderingContext2D,
  clip: TextClip,
  localSec: number,
  w: number,
  h: number
) => {
  const style = clip.style;
  ctx.font = fontCss(style);
  const { width: preW, height: preH } = measureTextBlock(ctx, clip.text || " ", style);
  const tr = computeTelopTransform(clip, localSec, w, h, { width: preW, height: preH });
  if (tr.opacity <= 0.001) return;

  const text = tr.visibleText;
  if (!text) return;

  ctx.save();
  ctx.globalAlpha *= tr.opacity;

  if (style.shadow.enabled) {
    ctx.shadowColor = style.shadow.color;
    ctx.shadowBlur = style.shadow.blur;
    ctx.shadowOffsetX = style.shadow.offsetX;
    ctx.shadowOffsetY = style.shadow.offsetY;
  }

  const { width, height } = measureTextBlock(ctx, text, style);
  const padX = style.background.enabled ? style.background.paddingX : 0;
  const padY = style.background.enabled ? style.background.paddingY : 0;
  const boxW = width + padX * 2;
  const boxH = height + padY * 2;

  const anchorX = clip.x * w + tr.offsetX;
  const anchorY = clip.y * h + tr.offsetY;

  ctx.translate(anchorX, anchorY);
  ctx.rotate((style.rotation * Math.PI) / 180);
  ctx.scale(tr.scale, tr.scale);

  let boxLeft = -boxW / 2;
  if (style.textAlign === "left") boxLeft = -padX;
  else if (style.textAlign === "right") boxLeft = -boxW + padX;
  const boxTop = -boxH / 2;

  if (style.background.enabled) {
    ctx.shadowColor = "transparent";
    ctx.fillStyle = style.background.color;
    ctx.globalAlpha *= style.background.opacity;
    const r = style.background.radius;
    const bx = boxLeft;
    const by = boxTop;
    ctx.beginPath();
    if (r > 0 && "roundRect" in ctx) {
      (ctx as CanvasRenderingContext2D & { roundRect: (...a: number[]) => void }).roundRect(
        bx,
        by,
        boxW,
        boxH,
        r
      );
    } else {
      ctx.rect(bx, by, boxW, boxH);
    }
    ctx.fill();
    ctx.globalAlpha /= style.background.opacity || 1;
    if (style.shadow.enabled) {
      ctx.shadowColor = style.shadow.color;
      ctx.shadowBlur = style.shadow.blur;
      ctx.shadowOffsetX = style.shadow.offsetX;
      ctx.shadowOffsetY = style.shadow.offsetY;
    }
  }

  const lineH = style.fontSize * style.lineHeight;
  const lines = linesOf(text);
  const textBoxLeft = boxLeft + padX;
  const startY = boxTop + padY + lineH / 2;

  const needsWipe =
    (style.animation.in === "wipe" || style.animation.in === "karaoke") &&
    tr.reveal < 0.999;

  if (needsWipe) {
    ctx.save();
    const clipW = boxW * tr.reveal;
    ctx.beginPath();
    ctx.rect(boxLeft, boxTop, clipW, boxH);
    ctx.clip();
  }

  for (let i = 0; i < lines.length; i++) {
    drawLine(ctx, lines[i], textBoxLeft, startY + i * lineH, style, width);
  }

  if (needsWipe) ctx.restore();

  ctx.restore();
};
