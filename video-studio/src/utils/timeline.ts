import type { TextClip, TimelineClip, Track } from "../types";
import { SNAP_GRID_SEC, clipOpacityAt, clipTimelineEnd } from "../types";

export const clipsOnTrack = <T extends TimelineClip>(clips: T[], trackId: string): T[] =>
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
  if (Math.abs(gap) < 0.02) return Math.min(d, clip.duration, next.duration);
  if (gap > 0) return 0;
  return Math.min(d, -gap, clip.duration, next.duration);
};

export const canPlaceClip = (
  clips: TimelineClip[],
  trackId: string,
  start: number,
  duration: number,
  excludeIds?: string | Set<string>
) => {
  const end = start + duration;
  const ex = typeof excludeIds === "string" ? new Set([excludeIds]) : excludeIds;
  return !clipsOnTrack(clips, trackId).some((c) => {
    if (ex?.has(c.id)) return false;
    const cEnd = clipTimelineEnd(c);
    return start < cEnd - 1e-5 && end > c.start + 1e-5;
  });
};

export const trackByKind = (tracks: Track[], kind: Track["kind"]) =>
  tracks.find((t) => t.kind === kind);

/** タイムライン表示順：上ほど手前レイヤー（テロップ → オーバーレイ → 映像[上位→下位] → 音声） */
export const displayOrderedTracks = (tracks: Track[]): Track[] => {
  const text = tracks.filter((t) => t.kind === "text");
  const overlay = tracks.filter((t) => t.kind === "overlay");
  const video = [...tracks.filter((t) => t.kind === "video")].reverse();
  const audio = tracks.filter((t) => t.kind === "audio");
  return [...text, ...overlay, ...video, ...audio];
};

/** desired 以降で、全ターゲットトラックに重ならず置ける最初の開始位置 */
export const findFreeStart = (
  clips: TimelineClip[],
  targets: { trackId: string; duration: number }[],
  desired: number,
  excludeIds?: Set<string>
): number => {
  let start = Math.max(0, desired);
  for (let guard = 0; guard < 500; guard++) {
    let blocker: TimelineClip | undefined;
    for (const { trackId, duration } of targets) {
      blocker = clipsOnTrack(clips, trackId).find(
        (c) => !excludeIds?.has(c.id) && start < clipTimelineEnd(c) - 1e-5 && start + duration > c.start + 1e-5
      );
      if (blocker) break;
    }
    if (!blocker) return start;
    start = clipTimelineEnd(blocker);
  }
  return start;
};

/**
 * スマートマグネット吸着：
 * クリップ開始・終了エッジが プレイヘッド / ループ点 / 他クリップ端 に近ければピタッと吸着し、
 * ガイド線を出すための時刻 `guideTime` も返す。それ以外はグリッド吸着。
 */
export const computeMagneticStart = (opts: {
  rawStart: number;
  duration: number;
  pxPerSec: number;
  snapEnabled: boolean;
  playhead: number;
  loopA: number | null;
  loopB: number | null;
  clips: TimelineClip[];
  textClips: TextClip[];
  excludeIds: Set<string>;
}): { start: number; guideTime: number | null } => {
  const clamped = Math.max(0, opts.rawStart);
  if (!opts.snapEnabled) return { start: clamped, guideTime: null };

  const thresholdSec = Math.min(0.35, Math.max(0.04, 10 / Math.max(8, opts.pxPerSec)));
  const anchors: number[] = [0, opts.playhead];
  if (opts.loopA != null) anchors.push(opts.loopA);
  if (opts.loopB != null) anchors.push(opts.loopB);
  for (const c of [...opts.clips, ...opts.textClips]) {
    if (opts.excludeIds.has(c.id)) continue;
    anchors.push(c.start, clipTimelineEnd(c));
  }

  let bestDelta = Infinity;
  let bestStart = clamped;
  let bestAnchor: number | null = null;

  for (const a of anchors) {
    const dStart = Math.abs(clamped - a);
    if (dStart <= thresholdSec && dStart < bestDelta) {
      bestDelta = dStart;
      bestStart = a;
      bestAnchor = a;
    }
    const endPos = clamped + opts.duration;
    const dEnd = Math.abs(endPos - a);
    if (dEnd <= thresholdSec && dEnd < bestDelta && a - opts.duration >= -1e-6) {
      bestDelta = dEnd;
      bestStart = Math.max(0, a - opts.duration);
      bestAnchor = a;
    }
  }

  if (bestAnchor != null) {
    return { start: bestStart, guideTime: bestAnchor };
  }

  const grid = opts.pxPerSec >= 100 ? 0.1 : SNAP_GRID_SEC;
  return { start: Math.max(0, Math.round(clamped / grid) * grid), guideTime: null };
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
