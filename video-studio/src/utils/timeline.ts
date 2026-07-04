import type { TimelineClip, Track } from "../types";
import { clipTimelineEnd } from "../types";

export const clipsOnTrack = (clips: TimelineClip[], trackId: string) =>
  clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);

export const trackEndTime = (clips: TimelineClip[], trackId: string) =>
  clipsOnTrack(clips, trackId).reduce((m, c) => Math.max(m, clipTimelineEnd(c)), 0);

export const findClipAtTime = (clips: TimelineClip[], trackId: string, time: number) =>
  clipsOnTrack(clips, trackId).find(
    (c) => time >= c.start && time < clipTimelineEnd(c)
  );

export const transitionOverlap = (
  clip: TimelineClip,
  next: TimelineClip | undefined
): number => {
  if (!next || clip.transitionOut?.kind !== "crossfade") return 0;
  const d = clip.transitionOut.duration;
  const gap = next.start - clipTimelineEnd(clip);
  // 隣接クリップ（gap≈0）でもクロスフェードを適用
  if (Math.abs(gap) < 0.001) return Math.min(d, clip.duration, next.duration);
  if (gap > 0) return 0;
  return Math.min(d, -gap, clip.duration, next.duration);
};

export const canPlaceClip = (
  clips: TimelineClip[],
  trackId: string,
  start: number,
  duration: number,
  excludeId?: string
) => {
  const end = start + duration;
  return !clipsOnTrack(clips, trackId).some((c) => {
    if (c.id === excludeId) return false;
    const cEnd = clipTimelineEnd(c);
    return start < cEnd && end > c.start;
  });
};

export const trackByKind = (tracks: Track[], kind: Track["kind"]) =>
  tracks.find((t) => t.kind === kind);
