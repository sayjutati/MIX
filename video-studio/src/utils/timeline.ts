import type { TimelineClip, Track } from "../types";
import { clipOpacityAt, clipTimelineEnd } from "../types";

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

/** desired 以降で、全ターゲットトラックに重ならず置ける最初の開始位置 */
export const findFreeStart = (
  clips: TimelineClip[],
  targets: { trackId: string; duration: number }[],
  desired: number
): number => {
  let start = desired;
  for (let guard = 0; guard < 500; guard++) {
    let blocker: TimelineClip | undefined;
    for (const { trackId, duration } of targets) {
      blocker = clipsOnTrack(clips, trackId).find(
        (c) => start < clipTimelineEnd(c) && start + duration > c.start
      );
      if (blocker) break;
    }
    if (!blocker) return start;
    start = clipTimelineEnd(blocker);
  }
  return start;
};

const MIN_CLIP_SEC = 0.1;

/**
 * トリム量（秒）の許容範囲。タイムライン上の隣接クリップとソース素材の範囲を超えない。
 * 既に範囲外（重なり済み等）の場合は「動かさない」側を許容する。
 */
export const trimDeltaLimits = (
  clips: TimelineClip[],
  clip: TimelineClip,
  edge: "start" | "end",
  maxSource: number,
  checkNeighbors = true
): { min: number; max: number } => {
  const speed = clip.speed || 1;
  const others = checkNeighbors
    ? clipsOnTrack(clips, clip.trackId).filter((c) => c.id !== clip.id)
    : [];
  const end = clipTimelineEnd(clip);

  if (edge === "start") {
    const prevEnd = others
      .filter((c) => c.start < end && clipTimelineEnd(c) <= clip.start + 1e-6)
      .reduce((m, c) => Math.max(m, clipTimelineEnd(c)), -Infinity);
    const min = Math.max(-clip.inPoint / speed, prevEnd - clip.start);
    const max = Math.min(clip.duration - MIN_CLIP_SEC, (maxSource - 0.05 - clip.inPoint) / speed);
    return { min: Math.min(min, 0), max: Math.max(max, 0) };
  }

  const nextStart = others
    .filter((c) => c.start >= end - 1e-6)
    .reduce((m, c) => Math.min(m, c.start), Infinity);
  const min = MIN_CLIP_SEC - clip.duration;
  const max = Math.min((maxSource - clip.inPoint) / speed - clip.duration, nextStart - end);
  return { min: Math.min(min, 0), max: Math.max(max, 0) };
};

/** 分割位置 local（クリップ内秒）より右側の不透明度キーフレームを 0 起点に付け替える */
export const splitOpacityKeyframes = (
  clip: TimelineClip,
  local: number,
  makeId: () => string
): TimelineClip["opacityKeyframes"] => {
  if (!clip.opacityKeyframes.length) return [];
  const sorted = [...clip.opacityKeyframes].sort((a, b) => a.t - b.t);
  const startValue = clipOpacityAt(clip, local);
  const rest = sorted.filter((k) => k.t > local).map((k) => ({ ...k, id: makeId(), t: k.t - local }));
  return [{ id: makeId(), t: 0, value: startValue }, ...rest];
};
