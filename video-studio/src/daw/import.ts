import type { MediaAsset, TimelineClip } from "../types";
import { defaultEffects } from "../types";

/** DAW .daw JSON の最小互換（version 5〜6） */
interface DawClip {
  id: number;
  offset: number;
  duration: number;
  /** DAW は data URL（data:audio/wav;base64,...）で保存する */
  audioData?: string;
  /** テイク比較で除外されたクリップ */
  muted?: boolean;
}

interface DawTrack {
  id: number;
  name: string;
  kind: string;
  volume?: number;
  speed?: number;
  nudgeMs?: number;
  isMuted?: boolean;
  isSolo?: boolean;
  clips?: DawClip[];
}

interface DawProject {
  version?: number;
  tracks?: DawTrack[];
  duration?: number;
  bpm?: number;
}

let importSeq = 0;

export const parseDawProject = (
  json: DawProject,
  trackId = "a2"
): { assets: MediaAsset[]; clips: TimelineClip[] } => {
  const assets: MediaAsset[] = [];
  const clips: TimelineClip[] = [];
  const batch = `${Date.now().toString(36)}${(importSeq++).toString(36)}`;
  let assetCounter = 0;

  const tracks = json.tracks ?? [];
  const hasSolo = tracks.some((t) => t.isSolo);

  for (const track of tracks) {
    if (track.isMuted || (hasSolo && !track.isSolo)) continue;
    const speed = track.speed && track.speed > 0 ? track.speed : 1;
    const startShift = (track.nudgeMs ?? 0) / 1000;

    for (const dc of track.clips ?? []) {
      if (!dc.audioData || dc.muted) continue;
      const id = `daw-${batch}-${assetCounter++}`;
      const url = URL.createObjectURL(decodeAudioData(dc.audioData));
      assets.push({
        id,
        name: `${track.name} #${dc.id}`,
        kind: "audio",
        url,
        duration: dc.duration,
      });
      clips.push({
        id: `clip-${id}`,
        assetId: id,
        trackId,
        start: Math.max(0, dc.offset + startShift),
        duration: dc.duration / speed,
        inPoint: 0,
        speed,
        volume: track.volume ?? 1,
        opacity: 1,
        audioMuted: false,
        effects: defaultEffects(),
        opacityKeyframes: [],
        origin: "daw",
      });
    }
  }

  return { assets, clips };
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
