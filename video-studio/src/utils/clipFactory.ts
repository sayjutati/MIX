import type { ClipOrigin, MediaAsset, TimelineClip } from "../types";
import { defaultEffects } from "../types";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const makeClip = (
  asset: MediaAsset,
  trackId: string,
  start: number,
  opts?: { origin?: ClipOrigin; linkedClipId?: string }
): TimelineClip => ({
  id: uid(),
  assetId: asset.id,
  trackId,
  start,
  duration: asset.kind === "image" ? 5 : asset.duration,
  inPoint: 0,
  speed: 1,
  volume: 1,
  opacity: 100,
  audioMuted: false,
  effects: defaultEffects(),
  opacityKeyframes: [],
  origin: opts?.origin ?? "media",
  linkedClipId: opts?.linkedClipId,
});

/** 動画クリップ + 同期する音声クリップ（同じファイル、別トラック） */
export const makeVideoWithLinkedAudio = (
  asset: MediaAsset,
  videoTrackId: string,
  audioTrackId: string,
  start: number
): TimelineClip[] => {
  const videoId = uid();
  const audioId = uid();
  const duration = asset.duration;
  const videoClip: TimelineClip = {
    id: videoId,
    assetId: asset.id,
    trackId: videoTrackId,
    start,
    duration,
    inPoint: 0,
    speed: 1,
    volume: 1,
    opacity: 100,
    audioMuted: false,
    effects: defaultEffects(),
    opacityKeyframes: [],
    origin: "media",
    linkedClipId: audioId,
  };
  const audioClip: TimelineClip = {
    id: audioId,
    assetId: asset.id,
    trackId: audioTrackId,
    start,
    duration,
    inPoint: 0,
    speed: 1,
    volume: 1,
    opacity: 100,
    audioMuted: false,
    effects: defaultEffects(),
    opacityKeyframes: [],
    origin: "video-linked",
    linkedClipId: videoId,
  };
  return [videoClip, audioClip];
};
