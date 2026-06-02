import type { ClipOrigin, EditorState, MediaAsset, TimelineClip, Track } from "../types";
import { clipTimelineEnd } from "../types";
import { clipsOnTrack } from "../utils/timeline";

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

/** ソロが有効ならソロトラックのみ、否则 ミュート以外 */
export const isTrackAudible = (tracks: Track[], trackId: string): boolean => {
  const anySolo = tracks.some((t) => t.solo);
  const track = tracks.find((t) => t.id === trackId);
  if (!track) return false;
  if (anySolo) return track.solo;
  return !track.muted;
};

export interface AudibleClip {
  clip: TimelineClip;
  asset: MediaAsset;
  track: Track;
  effectiveVolume: number;
}

export const collectAudibleClips = (
  state: EditorState,
  time: number
): AudibleClip[] => {
  const result: AudibleClip[] = [];
  const assetMap = new Map(state.assets.map((a) => [a.id, a]));
  const playedVideoAudio = new Set<string>();

  for (const track of state.tracks) {
    if (track.kind !== "audio" || !isTrackAudible(state.tracks, track.id)) continue;

    for (const clip of clipsOnTrack(state.clips, track.id)) {
      if (time < clip.start || time >= clipTimelineEnd(clip)) continue;
      if (clip.audioMuted) continue;

      const asset = assetMap.get(clip.assetId);
      if (!asset) continue;

      const origin = getClipOrigin(clip);
      if (origin === "video-linked") {
        if (playedVideoAudio.has(clip.assetId)) continue;
        playedVideoAudio.add(clip.assetId);
      }

      const trackVol = track.volume ?? 1;
      const effectiveVolume =
        clip.volume * trackVol * state.masterVolume * (state.audioEnabled ? 1 : 0);

      result.push({ clip, asset, track, effectiveVolume });
    }
  }

  return result;
};

/** 書き出し用: タイムライン上の全オーディオクリップ */
export const allMixClips = (state: EditorState): AudibleClip[] => {
  const result: AudibleClip[] = [];
  const assetMap = new Map(state.assets.map((a) => [a.id, a]));
  const seenLinkedAsset = new Set<string>();

  for (const track of state.tracks) {
    if (track.kind !== "audio" || !isTrackAudible(state.tracks, track.id)) continue;
    for (const clip of clipsOnTrack(state.clips, track.id)) {
      if (clip.audioMuted) continue;
      const asset = assetMap.get(clip.assetId);
      if (!asset) continue;
      const origin = getClipOrigin(clip);
      if (origin === "video-linked") {
        if (seenLinkedAsset.has(clip.assetId)) continue;
        seenLinkedAsset.add(clip.assetId);
      }
      const trackVol = track.volume ?? 1;
      result.push({
        clip,
        asset,
        track,
        effectiveVolume: clip.volume * trackVol * state.masterVolume,
      });
    }
  }
  return result;
};
