import type { ClipEffects, EditorState, MediaAsset, TimelineClip } from "../types";
import { clipOpacityAt, clipTimelineEnd, resolveTransform } from "../types";
import { drawTelop } from "../text/renderText";
import { clipsOnTrack, transitionOverlap } from "../utils/timeline";

const previewVideoCache = new Map<string, HTMLVideoElement>();
const exportVideoCache = new Map<string, HTMLVideoElement>();
const imageCache = new Map<string, HTMLImageElement>();
const readyListeners = new Set<() => void>();

const notifyReady = () => {
  for (const fn of readyListeners) fn();
};

/** 動画の seeked / 画像の load 完了時にプレビュー再描画を受け取る */
export const onCompositorMediaReady = (fn: () => void): (() => void) => {
  readyListeners.add(fn);
  return () => {
    readyListeners.delete(fn);
  };
};

const createVideoEl = (url: string, notify: boolean): HTMLVideoElement => {
  const v = document.createElement("video");
  v.crossOrigin = "anonymous";
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  if (notify) {
    v.addEventListener("loadeddata", notifyReady);
    v.addEventListener("seeked", notifyReady);
  }
  v.src = url;
  return v;
};

export const getVideoElement = (url: string, forExport = false): HTMLVideoElement => {
  const cache = forExport ? exportVideoCache : previewVideoCache;
  let v = cache.get(url);
  if (!v) {
    v = createVideoEl(url, !forExport);
    cache.set(url, v);
  }
  return v;
};

export const getImageElement = (url: string): HTMLImageElement => {
  let img = imageCache.get(url);
  if (!img) {
    img = new Image();
    img.crossOrigin = "anonymous";
    img.addEventListener("load", notifyReady);
    img.src = url;
    imageCache.set(url, img);
  }
  return img;
};

export const filterCss = (fx: ClipEffects) => {
  const parts: string[] = [];
  if (fx.brightness !== 100) parts.push(`brightness(${fx.brightness}%)`);
  if (fx.contrast !== 100) parts.push(`contrast(${fx.contrast}%)`);
  if (fx.saturation !== 100) parts.push(`saturate(${fx.saturation}%)`);
  if (fx.blur > 0) parts.push(`blur(${fx.blur}px)`);
  if (fx.grayscale > 0) parts.push(`grayscale(${fx.grayscale}%)`);
  if (fx.sepia > 0) parts.push(`sepia(${fx.sepia}%)`);
  return parts.length ? parts.join(" ") : "none";
};

export interface VisualBounds {
  cx: number;
  cy: number;
  width: number;
  height: number;
  left: number;
  top: number;
  rotation: number;
}

export const computeVisualBounds = (
  clip: TimelineClip,
  srcW: number,
  srcH: number,
  canvasW: number,
  canvasH: number
): VisualBounds => {
  const tr = resolveTransform(clip);
  const safeSrcW = Math.max(1, srcW || canvasW);
  const safeSrcH = Math.max(1, srcH || canvasH);
  const fitScale =
    tr.fit === "cover"
      ? Math.max(canvasW / safeSrcW, canvasH / safeSrcH)
      : Math.min(canvasW / safeSrcW, canvasH / safeSrcH);
  const width = safeSrcW * fitScale * tr.scale;
  const height = safeSrcH * fitScale * tr.scale;
  const cx = tr.x * canvasW;
  const cy = tr.y * canvasH;
  return {
    cx,
    cy,
    width,
    height,
    left: cx - width / 2,
    top: cy - height / 2,
    rotation: tr.rotation,
  };
};

export const getVisualClipBounds = (
  state: EditorState,
  clip: TimelineClip
): VisualBounds | null => {
  const asset = state.assets.find((a) => a.id === clip.assetId);
  if (!asset || (asset.kind !== "video" && asset.kind !== "image")) return null;
  let srcW = asset.width || 0;
  let srcH = asset.height || 0;
  if (!srcW || !srcH) {
    if (asset.kind === "video") {
      const v = previewVideoCache.get(asset.url);
      srcW = v?.videoWidth || state.previewWidth;
      srcH = v?.videoHeight || state.previewHeight;
    } else {
      const img = imageCache.get(asset.url);
      srcW = img?.naturalWidth || state.previewWidth;
      srcH = img?.naturalHeight || state.previewHeight;
    }
  }
  return computeVisualBounds(clip, srcW, srcH, state.previewWidth, state.previewHeight);
};

export const hitTestVisualClip = (
  state: EditorState,
  clip: TimelineClip,
  px: number,
  py: number
): boolean => {
  const b = getVisualClipBounds(state, clip);
  if (!b) return false;
  const dx = px - b.cx;
  const dy = py - b.cy;
  const rad = (-b.rotation * Math.PI) / 180;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= b.width / 2 + 6 && Math.abs(ly) <= b.height / 2 + 6;
};

interface ResolvedVisualOp {
  asset: MediaAsset;
  clip: TimelineClip;
  sourceTime: number;
  alpha: number;
}

/**
 * プレビューと書き出しで完全に共有するビジュアル合成プラン。
 * 隣接クロスフェード時も下地を保ったまま次クリップを重ねるため黒画面に沈まない。
 */
export const buildVisualOps = (state: EditorState, time: number): ResolvedVisualOp[] => {
  const ops: ResolvedVisualOp[] = [];
  const assetMap = new Map(state.assets.map((a) => [a.id, a]));

  const pushTrackOps = (trackClips: TimelineClip[], acceptKind: "video" | "image") => {
    for (let i = 0; i < trackClips.length; i++) {
      const clip = trackClips[i]!;
      const end = clipTimelineEnd(clip);
      const asset = assetMap.get(clip.assetId);
      if (!asset || asset.kind !== acceptKind) continue;

      const prev = i > 0 ? trackClips[i - 1] : undefined;
      const next = trackClips[i + 1];
      const prevOverlap = prev ? transitionOverlap(prev, clip) : 0;
      const prevAdjacent = prev ? Math.abs(clip.start - clipTimelineEnd(prev)) < 0.02 : false;
      const nextOverlap = transitionOverlap(clip, next);
      const nextAdjacent = next ? Math.abs(next.start - end) < 0.02 : false;

      if (time >= clip.start && time < end) {
        const local = time - clip.start;
        let alpha = clipOpacityAt(clip, local) / 100;
        // 時間的に重なっているクロスフェード（clip.start < prev.end）では上側を 0→1 で重ねる
        if (prev && !prevAdjacent && prevOverlap > 0 && local < prevOverlap) {
          alpha *= Math.max(0, Math.min(1, local / prevOverlap));
        }
        const speed = clip.speed || 1;
        const sourceTime = Math.max(0, clip.inPoint + local * speed);
        if (alpha > 0.001) {
          ops.push({ asset, clip, sourceTime, alpha });
        }

        // 隣接クロスフェード区間 [end - nextOverlap, end): 下地 clip の上に next を 0→1 でブレンド
        if (next && nextAdjacent && nextOverlap > 0 && end - time <= nextOverlap) {
          const nextAsset = assetMap.get(next.assetId);
          if (nextAsset && nextAsset.kind === acceptKind) {
            const p = Math.max(0, Math.min(1, (time - (end - nextOverlap)) / nextOverlap));
            const baseNextOpacity = clipOpacityAt({ ...next, fadeIn: 0, fadeOut: 0 }, 0) / 100;
            const nextAlpha = baseNextOpacity * p;
            const nextSpeed = next.speed || 1;
            const nextSource = Math.max(0, next.inPoint + (time - next.start) * nextSpeed);
            if (nextAlpha > 0.001) {
              ops.push({ asset: nextAsset, clip: next, sourceTime: nextSource, alpha: nextAlpha });
            }
          }
        }
      }
    }
  };

  for (const track of state.tracks) {
    if (track.hidden) continue;
    if (track.kind === "video") {
      pushTrackOps(clipsOnTrack(state.clips, track.id), "video");
    }
  }
  for (const track of state.tracks) {
    if (track.hidden) continue;
    if (track.kind === "overlay") {
      pushTrackOps(clipsOnTrack(state.clips, track.id), "image");
    }
  }

  return ops;
};

const drawMediaWithTransform = (
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  clip: TimelineClip,
  canvasW: number,
  canvasH: number,
  alpha: number
) => {
  const tr = resolveTransform(clip);
  const b = computeVisualBounds(clip, srcW, srcH, canvasW, canvasH);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.filter = filterCss(clip.effects);
  ctx.translate(b.cx, b.cy);
  if (tr.rotation) ctx.rotate((tr.rotation * Math.PI) / 180);
  if (tr.flipH) ctx.scale(-1, 1);
  ctx.drawImage(source, -b.width / 2, -b.height / 2, b.width, b.height);
  ctx.restore();
};

const clampVideoTime = (video: HTMLVideoElement, t: number) => {
  const safe = Math.max(0, t);
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return Math.min(safe, Math.max(0, video.duration - 0.001));
  }
  return safe;
};

const syncVideoForPreview = (video: HTMLVideoElement, sourceTime: number, speed: number, isPlaying: boolean) => {
  const target = clampVideoTime(video, sourceTime);
  const rate = Math.max(0.25, Math.min(4, speed || 1));
  if (isPlaying) {
    if (video.playbackRate !== rate) video.playbackRate = rate;
    if (Math.abs(video.currentTime - target) > 0.18) {
      video.currentTime = target;
    }
    if (video.paused) {
      void video.play().catch(() => {});
    }
  } else {
    if (!video.paused) video.pause();
    if (Math.abs(video.currentTime - target) > 0.008 && !video.seeking) {
      video.currentTime = target;
    }
  }
};

const ensureVideoMetadata = (video: HTMLVideoElement): Promise<void> => {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("loadedmetadata", done);
      video.removeEventListener("error", done);
      resolve();
    };
    video.addEventListener("loadedmetadata", done, { once: true });
    video.addEventListener("error", done, { once: true });
    window.setTimeout(done, 800);
  });
};

/** 書き出し用: 正確に seeked を待ってから描画（フレームずれ・キーフレーム飛び防止） */
export const seekVideoAsync = async (video: HTMLVideoElement, sourceTime: number): Promise<void> => {
  await ensureVideoMetadata(video);
  if (!video.paused) video.pause();
  const t = clampVideoTime(video, sourceTime);
  if (video.readyState >= 2 && Math.abs(video.currentTime - t) < 0.004) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", finish);
      video.removeEventListener("error", finish);
      resolve();
    };
    video.addEventListener("seeked", finish, { once: true });
    video.addEventListener("error", finish, { once: true });
    try {
      video.currentTime = t;
    } catch {
      finish();
      return;
    }
    window.setTimeout(finish, 500);
  });
};

const drawTextLayers = (ctx: CanvasRenderingContext2D, state: EditorState, time: number) => {
  const { previewWidth: w, previewHeight: h } = state;
  const textTracks = state.tracks.filter((t) => t.kind === "text" && !t.hidden);
  for (const track of textTracks) {
    for (const t of clipsOnTrack(state.textClips, track.id)) {
      const end = clipTimelineEnd(t);
      if (time < t.start || time >= end) continue;
      drawTelop(ctx, t, time - t.start, w, h);
    }
  }
};

export const renderFrame = (
  ctx: CanvasRenderingContext2D,
  state: EditorState,
  time: number
) => {
  const { previewWidth: w, previewHeight: h } = state;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  const ops = buildVisualOps(state, time);
  const activeVideoUrls = new Set<string>();

  for (const op of ops) {
    if (op.asset.kind === "video") {
      activeVideoUrls.add(op.asset.url);
      const video = getVideoElement(op.asset.url, false);
      syncVideoForPreview(video, op.sourceTime, op.clip.speed || 1, state.isPlaying);
      if (video.readyState >= 2) {
        drawMediaWithTransform(
          ctx,
          video,
          video.videoWidth || op.asset.width || w,
          video.videoHeight || op.asset.height || h,
          op.clip,
          w,
          h,
          op.alpha
        );
      }
    } else if (op.asset.kind === "image") {
      const img = getImageElement(op.asset.url);
      if (img.complete && img.naturalWidth > 0) {
        drawMediaWithTransform(
          ctx,
          img,
          img.naturalWidth || op.asset.width || w,
          img.naturalHeight || op.asset.height || h,
          op.clip,
          w,
          h,
          op.alpha
        );
      }
    }
  }

  // 非アクティブなプレビュー動画を確実に停止する
  for (const [url, video] of previewVideoCache) {
    if (!activeVideoUrls.has(url) && !video.paused) {
      video.pause();
    }
  }

  drawTextLayers(ctx, state, time);
};

/** 書き出し・静止画キャプチャ用: 全メディアのロード・シーク完了を待ってからプレビューと完全同一に描画 */
export const renderFrameAsync = async (
  ctx: CanvasRenderingContext2D,
  state: EditorState,
  time: number
) => {
  const { previewWidth: w, previewHeight: h } = state;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  const ops = buildVisualOps(state, time);

  for (const op of ops) {
    if (op.asset.kind === "video") {
      const video = getVideoElement(op.asset.url, true);
      await seekVideoAsync(video, op.sourceTime);
      drawMediaWithTransform(
        ctx,
        video,
        video.videoWidth || op.asset.width || w,
        video.videoHeight || op.asset.height || h,
        op.clip,
        w,
        h,
        op.alpha
      );
    } else if (op.asset.kind === "image") {
      const img = getImageElement(op.asset.url);
      if (!img.complete) {
        await new Promise<void>((r) => {
          img.addEventListener("load", () => r(), { once: true });
          img.addEventListener("error", () => r(), { once: true });
        });
      }
      if (img.naturalWidth > 0) {
        drawMediaWithTransform(
          ctx,
          img,
          img.naturalWidth || op.asset.width || w,
          img.naturalHeight || op.asset.height || h,
          op.clip,
          w,
          h,
          op.alpha
        );
      }
    }
  }

  drawTextLayers(ctx, state, time);
};

export const pauseAllPreviewVideos = () => {
  for (const v of previewVideoCache.values()) {
    if (!v.paused) v.pause();
  }
};

export const clearMediaCache = () => {
  for (const v of previewVideoCache.values()) {
    v.pause();
    v.removeAttribute("src");
    v.load();
  }
  for (const v of exportVideoCache.values()) {
    v.pause();
    v.removeAttribute("src");
    v.load();
  }
  previewVideoCache.clear();
  exportVideoCache.clear();
  imageCache.clear();
};
