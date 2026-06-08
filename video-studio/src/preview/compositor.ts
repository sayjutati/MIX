import type { ClipEffects, EditorState, MediaAsset, TimelineClip } from "../types";
import { clipOpacityAt, clipTimelineEnd } from "../types";
import { drawTelop } from "../text/renderText";
import { clipsOnTrack, transitionOverlap } from "../utils/timeline";

const videoCache = new Map<string, HTMLVideoElement>();
const imageCache = new Map<string, HTMLImageElement>();

export const getVideoElement = (url: string): HTMLVideoElement => {
  let v = videoCache.get(url);
  if (!v) {
    v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    videoCache.set(url, v);
  }
  return v;
};

export const getImageElement = (url: string): HTMLImageElement => {
  let img = imageCache.get(url);
  if (!img) {
    img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    imageCache.set(url, img);
  }
  return img;
};

const filterCss = (fx: ClipEffects) => {
  const parts: string[] = [];
  if (fx.brightness !== 100) parts.push(`brightness(${fx.brightness}%)`);
  if (fx.contrast !== 100) parts.push(`contrast(${fx.contrast}%)`);
  if (fx.saturation !== 100) parts.push(`saturate(${fx.saturation}%)`);
  if (fx.blur > 0) parts.push(`blur(${fx.blur}px)`);
  if (fx.grayscale > 0) parts.push(`grayscale(${fx.grayscale}%)`);
  if (fx.sepia > 0) parts.push(`sepia(${fx.sepia}%)`);
  return parts.length ? parts.join(" ") : "none";
};

const seekVideo = (video: HTMLVideoElement, sourceTime: number) => {
  if (Math.abs(video.currentTime - sourceTime) > 0.05) {
    video.currentTime = Math.max(0, sourceTime);
  }
};

const drawClipMedia = (
  ctx: CanvasRenderingContext2D,
  asset: MediaAsset,
  clip: TimelineClip,
  localSec: number,
  w: number,
  h: number,
  alpha: number
) => {
  const sourceT = clip.inPoint + localSec * clip.speed;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.filter = filterCss(clip.effects);

  if (asset.kind === "video") {
    const video = getVideoElement(asset.url);
    seekVideo(video, sourceT);
    const vw = video.videoWidth || w;
    const vh = video.videoHeight || h;
    const scale = Math.min(w / vw, h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else if (asset.kind === "image") {
    const img = getImageElement(asset.url);
    const iw = img.naturalWidth || w;
    const ih = img.naturalHeight || h;
    const scale = Math.min(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  ctx.restore();
};

export interface CompositeLayer {
  trackKind: string;
  z: number;
}

export const renderFrame = (
  ctx: CanvasRenderingContext2D,
  state: EditorState,
  time: number
) => {
  const { previewWidth: w, previewHeight: h } = state;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  const assetMap = new Map(state.assets.map((a) => [a.id, a]));

  const videoTracks = state.tracks.filter((t) => t.kind === "video" && !t.hidden);
  for (const track of videoTracks) {
    const list = clipsOnTrack(state.clips, track.id);
    for (let i = 0; i < list.length; i++) {
      const clip = list[i];
      const end = clipTimelineEnd(clip);
      if (time < clip.start || time >= end) continue;
      const asset = assetMap.get(clip.assetId);
      if (!asset || asset.kind !== "video") continue;

      const local = time - clip.start;
      let alpha = clipOpacityAt(clip, local) / 100;
      const next = list[i + 1];
      const overlap = transitionOverlap(clip, next);
      if (overlap > 0 && next) {
        const tail = end - time;
        if (tail <= overlap) {
          alpha *= tail / overlap;
        }
      }
      if (i > 0) {
        const prev = list[i - 1];
        const prevOverlap = transitionOverlap(prev, clip);
        if (prevOverlap > 0 && time - clip.start < prevOverlap) {
          const head = time - clip.start;
          alpha *= head / prevOverlap;
        }
      }

      drawClipMedia(ctx, asset, clip, local, w, h, alpha);
    }
  }

  const overlayTrack = state.tracks.find((t) => t.kind === "overlay" && !t.hidden);
  if (overlayTrack) {
    for (const clip of clipsOnTrack(state.clips, overlayTrack.id)) {
      const end = clipTimelineEnd(clip);
      if (time < clip.start || time >= end) continue;
      const asset = assetMap.get(clip.assetId);
      if (!asset || asset.kind !== "image") continue;
      const local = time - clip.start;
      const alpha = clipOpacityAt(clip, local) / 100;
      drawClipMedia(ctx, asset, clip, local, w, h, alpha);
    }
  }

  const textTracks = state.tracks.filter((t) => t.kind === "text" && !t.hidden);
  for (const track of textTracks) {
    for (const t of state.textClips.filter((c) => c.trackId === track.id)) {
      const end = clipTimelineEnd(t);
      if (time < t.start || time >= end) continue;
      drawTelop(ctx, t, time - t.start, w, h);
    }
  }
};

export const clearMediaCache = () => {
  videoCache.clear();
  imageCache.clear();
};
