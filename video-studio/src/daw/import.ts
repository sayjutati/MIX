import type { MediaAsset, TimelineClip, Track } from "../types";
import { defaultEffects } from "../types";

/** DAW .daw JSON の互換型（version 1〜6 対応） */
interface DawClip {
  id: number;
  offset: number;
  duration: number;
  /** DAW は data URL（data:audio/wav;base64,...）で保存する */
  audioData?: string;
  /** テイク比較で除外されたクリップ */
  muted?: boolean;
  notes?: unknown[];
}

interface DawTrack {
  id: number;
  name: string;
  kind?: string;
  color?: string;
  volume?: number;
  speed?: number;
  pitch?: number;
  bass?: number;
  treble?: number;
  noiseReduce?: number;
  compressor?: number;
  chorus?: number;
  delay?: number;
  reverb?: number;
  tremolo?: number;
  deEss?: number;
  synthVoice?: string;
  fadeIn?: number;
  fadeOut?: number;
  nudgeMs?: number;
  isMuted?: boolean;
  isSolo?: boolean;
  clips?: DawClip[];
  /** 旧フォーマット（v3 以前）の単一クリップ互換 */
  offset?: number;
  duration?: number;
  audioData?: string;
}

export interface DawProject {
  version?: number;
  tracks?: DawTrack[];
  duration?: number;
  bpm?: number;
  masterVolume?: number;
}

export interface DawImportResult {
  assets: MediaAsset[];
  clips: TimelineClip[];
  /** 2トラック目以降を重ならず配置するための追加音声トラック */
  extraTracks: Track[];
  /** DAW 固有の FX / ピッチ編集が含まれていたか */
  hasUnbakedFx: boolean;
}

let importSeq = 0;

const trackHasFx = (t: DawTrack): boolean =>
  Boolean(
    t.synthVoice ||
      (t.pitch && t.pitch !== 0) ||
      (t.bass && t.bass !== 0) ||
      (t.treble && t.treble !== 0) ||
      (t.noiseReduce && t.noiseReduce > 0) ||
      (t.compressor && t.compressor > 0) ||
      (t.chorus && t.chorus > 0) ||
      (t.delay && t.delay > 0) ||
      (t.reverb && t.reverb > 0) ||
      (t.tremolo && t.tremolo > 0) ||
      (t.deEss && t.deEss > 0) ||
      (t.clips ?? []).some((c) => Array.isArray(c.notes) && c.notes.length > 0)
  );

const normalizeTrackClips = (track: DawTrack): DawClip[] => {
  if (Array.isArray(track.clips) && track.clips.length > 0) {
    return track.clips;
  }
  if (track.audioData && (track.duration ?? 0) > 0) {
    return [
      {
        id: 1,
        offset: track.offset ?? 0,
        duration: track.duration ?? 0,
        audioData: track.audioData,
      },
    ];
  }
  return [];
};

export const parseDawProject = (
  json: DawProject,
  firstTrackId = "a2"
): DawImportResult => {
  const assets: MediaAsset[] = [];
  const clips: TimelineClip[] = [];
  const extraTracks: Track[] = [];
  const batch = `${Date.now().toString(36)}${(importSeq++).toString(36)}`;
  let assetCounter = 0;
  let activeTrackIndex = 0;
  let hasUnbakedFx = false;

  const tracks = json.tracks ?? [];
  const hasSolo = tracks.some((t) => t.isSolo);
  const masterGain =
    typeof json.masterVolume === "number" && Number.isFinite(json.masterVolume)
      ? Math.max(0, json.masterVolume)
      : 1;

  for (const track of tracks) {
    if (track.isMuted || (hasSolo && !track.isSolo)) continue;
    const rawClips = normalizeTrackClips(track).filter((c) => c.audioData && !c.muted);
    if (rawClips.length === 0) continue;

    if (trackHasFx(track)) hasUnbakedFx = true;

    let assignedTrackId = firstTrackId;
    if (activeTrackIndex > 0) {
      assignedTrackId = `daw-track-${batch}-${activeTrackIndex}`;
      extraTracks.push({
        id: assignedTrackId,
        name: `DAW: ${track.name || `Track ${activeTrackIndex + 1}`}`,
        kind: "audio",
        color: track.color || "#a855f7",
        height: 56,
        locked: false,
        muted: false,
        hidden: false,
        solo: false,
        volume: 1,
        clips: [],
      });
    }
    activeTrackIndex++;

    const speed = track.speed && track.speed > 0 ? track.speed : 1;
    const startShift = (track.nudgeMs ?? 0) / 1000;
    const clipVolume = Math.max(0, Math.min(2, (track.volume ?? 1) * masterGain));
    const fadeIn = Math.max(0, track.fadeIn ?? 0);
    const fadeOut = Math.max(0, track.fadeOut ?? 0);

    for (const dc of rawClips) {
      if (!dc.audioData || dc.muted) continue;
      const rawStart = (dc.offset ?? 0) + startShift;
      const inPoint = rawStart < 0 ? Math.min(dc.duration, -rawStart * speed) : 0;
      const effectiveSourceDur = Math.max(0, dc.duration - inPoint);
      const playDuration = effectiveSourceDur / speed;
      if (playDuration <= 0.005) continue;

      const id = `daw-${batch}-${assetCounter++}`;
      const blob = decodeAudioData(dc.audioData);
      const url = URL.createObjectURL(blob);
      assets.push({
        id,
        name: `${track.name} #${dc.id}`,
        kind: "audio",
        mimeType: blob.type || "audio/wav",
        url,
        duration: dc.duration,
      });
      clips.push({
        id: `clip-${id}`,
        assetId: id,
        trackId: assignedTrackId,
        start: Math.max(0, rawStart),
        duration: playDuration,
        inPoint,
        speed,
        volume: clipVolume,
        opacity: 100,
        audioMuted: false,
        fadeIn: fadeIn > 0 ? Math.min(fadeIn, playDuration) : undefined,
        fadeOut: fadeOut > 0 ? Math.min(fadeOut, playDuration) : undefined,
        effects: defaultEffects(),
        opacityKeyframes: [],
        origin: "daw",
      });
    }
  }

  return { assets, clips, extraTracks, hasUnbakedFx };
};

/** data URL / 生 base64 のどちらでも Blob にする */
export const decodeAudioData = (data: string): Blob => {
  let mime = "audio/wav";
  let b64 = data;
  if (data.startsWith("data:")) {
    const comma = data.indexOf(",");
    const header = data.slice(5, comma);
    mime = header.split(";")[0] || mime;
    b64 = data.slice(comma + 1);
  }
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
};
