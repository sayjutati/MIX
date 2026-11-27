import type { ClipOrigin, EditorState, MediaAsset, TimelineClip, Track } from "../types";
import { clipFadeGainAt, clipTimelineEnd } from "../types";
import { clipsOnTrack, transitionOverlap } from "../utils/timeline";

export type { ClipOrigin };

/** クリップが持つ音声の出所（DAWミックスと動画内蔵は別物） */
export const originLabel: Record<ClipOrigin, string> = {
  media: "ファイル音声",
  daw: "DAWミックス",
  "video-linked": "動画から抽出",
};

export const getClipOrigin = (clip: TimelineClip): ClipOrigin =>
  clip.origin ?? "media";

export const getLinkedClip = (state: EditorState, clipId: string): TimelineClip | null => {
  const clip = state.clips.find((c) => c.id === clipId);
  if (!clip?.linkedClipId) return null;
  return state.clips.find((c) => c.id === clip.linkedClipId) ?? null;
};

export const isVideoClip = (state: EditorState, clip: TimelineClip) => {
  const track = state.tracks.find((t) => t.id === clip.trackId);
  const asset = state.assets.find((a) => a.id === clip.assetId);
  return track?.kind === "video" && asset?.kind === "video";
};

export const isAudioClip = (state: EditorState, clip: TimelineClip) => {
  const track = state.tracks.find((t) => t.id === clip.trackId);
  return track?.kind === "audio";
};

/** ソロが有効ならソロトラックのみ、それ以外はミュート以外 */
export const isTrackAudible = (tracks: Track[], trackId: string): boolean => {
  const anySolo = tracks.some((t) => t.solo);
  const track = tracks.find((t) => t.id === trackId);
  if (!track) return false;
  if (anySolo) return track.solo;
  return !track.muted;
};

const linkedDedupeKey = (clip: TimelineClip) =>
  `${clip.assetId}|${clip.start.toFixed(4)}|${clip.inPoint.toFixed(4)}`;

/**
 * クリップ単体のフェードイン/アウト＋トラック内クロスフェードを統合した実効フェード秒数。
 * プレビュー再生 (playbackEngine) とオフライン書き出し (mixOffline) の両方で完全共有する。
 */
export const resolveEffectiveAudioFades = (
  trackClips: TimelineClip[],
  index: number
): { fadeIn: number; fadeOut: number } => {
  const clip = trackClips[index]!;
  let fadeIn = Math.max(0, clip.fadeIn ?? 0);
  let fadeOut = Math.max(0, clip.fadeOut ?? 0);
  const prev = index > 0 ? trackClips[index - 1] : undefined;
  const next = trackClips[index + 1];
  if (prev) {
    const ov = transitionOverlap(prev, clip);
    if (ov > 0) fadeIn = Math.max(fadeIn, ov);
  }
  if (next) {
    const ov = transitionOverlap(clip, next);
    if (ov > 0) fadeOut = Math.max(fadeOut, ov);
  }
  return {
    fadeIn: Math.min(clip.duration, fadeIn),
    fadeOut: Math.min(clip.duration, fadeOut),
  };
};

export interface AudibleClip {
  clip: TimelineClip;
  asset: MediaAsset;
  track: Track;
  /** フェード前の基準音量（clip.volume * track.volume * masterVolume） */
  baseVolume: number;
  /** プレビューでは現在時刻のフェード反映済み音量、書き出しリストでは基準音量 */
  effectiveVolume: number;
  fadeIn: number;
  fadeOut: number;
}

export const collectAudibleClips = (
  state: EditorState,
  time: number
): AudibleClip[] => {
  const result: AudibleClip[] = [];
  const assetMap = new Map(state.assets.map((a) => [a.id, a]));
  const seenLinked = new Set<string>();

  for (const track of state.tracks) {
    if (track.kind !== "audio" || !isTrackAudible(state.tracks, track.id)) continue;
    const list = clipsOnTrack(state.clips, track.id);

    for (let i = 0; i < list.length; i++) {
      const clip = list[i]!;
      if (time < clip.start || time >= clipTimelineEnd(clip)) continue;
      if (clip.audioMuted) continue;

      const asset = assetMap.get(clip.assetId);
      if (!asset) continue;

      const origin = getClipOrigin(clip);
      if (origin === "video-linked") {
        const key = linkedDedupeKey(clip);
        if (seenLinked.has(key)) continue;
        seenLinked.add(key);
      }

      const { fadeIn, fadeOut } = resolveEffectiveAudioFades(list, i);
      const local = time - clip.start;
      const env = clipFadeGainAt({ duration: clip.duration, fadeIn, fadeOut }, local);
      const trackVol = track.volume ?? 1;
      const baseVolume = clip.volume * trackVol * state.masterVolume;
      const effectiveVolume = baseVolume * env * (state.audioEnabled ? 1 : 0);

      result.push({ clip, asset, track, baseVolume, effectiveVolume, fadeIn, fadeOut });
    }
  }

  return result;
};

/** 書き出し用: タイムライン上の全オーディオクリップ（collectAudibleClips と完全同一の除外＆フェード規則） */
export const allMixClips = (state: EditorState): AudibleClip[] => {
  if (!state.audioEnabled || state.masterVolume <= 0) return [];
  const result: AudibleClip[] = [];
  const assetMap = new Map(state.assets.map((a) => [a.id, a]));
  const seenLinked = new Set<string>();

  for (const track of state.tracks) {
    if (track.kind !== "audio" || !isTrackAudible(state.tracks, track.id)) continue;
    const list = clipsOnTrack(state.clips, track.id);

    for (let i = 0; i < list.length; i++) {
      const clip = list[i]!;
      if (clip.audioMuted) continue;
      const asset = assetMap.get(clip.assetId);
      if (!asset) continue;

      const origin = getClipOrigin(clip);
      if (origin === "video-linked") {
        const key = linkedDedupeKey(clip);
        if (seenLinked.has(key)) continue;
        seenLinked.add(key);
      }

      const { fadeIn, fadeOut } = resolveEffectiveAudioFades(list, i);
      const trackVol = track.volume ?? 1;
      const baseVolume = clip.volume * trackVol * state.masterVolume;

      result.push({
        clip,
        asset,
        track,
        baseVolume,
        effectiveVolume: baseVolume,
        fadeIn,
        fadeOut,
      });
    }
  }
  return result;
};
