import type { MediaAsset, TimelineClip } from "../types";

/** DAW .daw JSON の最小互換（version 5 想定） */
interface DawClip {
  id: number;
  offset: number;
  duration: number;
  audioData?: string;
}

interface DawTrack {
  id: number;
  name: string;
  kind: string;
  clips: DawClip[];
}

interface DawProject {
  version?: number;
  tracks?: DawTrack[];
  duration?: number;
  bpm?: number;
}

export const parseDawProject = (json: DawProject): { assets: MediaAsset[]; clips: TimelineClip[] } => {
  const assets: MediaAsset[] = [];
  const clips: TimelineClip[] = [];
  let assetCounter = 0;

  for (const track of json.tracks ?? []) {
    for (const dc of track.clips) {
      if (!dc.audioData) continue;
      const id = `daw-${assetCounter++}`;
      const blob = base64ToWavBlob(dc.audioData);
      const url = URL.createObjectURL(blob);
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
        trackId: "a2",
        start: dc.offset,
        duration: dc.duration,
        inPoint: 0,
        speed: 1,
        volume: 1,
        opacity: 1,
        audioMuted: false,
        effects: {
          brightness: 100,
          contrast: 100,
          saturation: 100,
          blur: 0,
          grayscale: 0,
          sepia: 0,
        },
        opacityKeyframes: [],
        origin: "daw",
      });
    }
  }

  return { assets, clips };
};

const base64ToWavBlob = (data: string) => {
  const bin = atob(data);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: "audio/wav" });
};

export const importAudioFile = async (
  file: File,
  trackId: string
): Promise<{ asset: MediaAsset; clip: TimelineClip }> => {
  const url = URL.createObjectURL(file);
  const duration = await probeAudioDuration(url);
  const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const asset: MediaAsset = {
    id,
    name: file.name,
    kind: "audio",
    url,
    duration,
  };
  const clip: TimelineClip = {
    id: `clip-${id}`,
    assetId: id,
    trackId,
    start: 0,
    duration,
    inPoint: 0,
    speed: 1,
    volume: 1,
    opacity: 1,
    audioMuted: false,
    effects: {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      blur: 0,
      grayscale: 0,
      sepia: 0,
    },
    opacityKeyframes: [],
  };
  return { asset, clip };
};

const probeAudioDuration = (url: string): Promise<number> =>
  new Promise((resolve) => {
    const a = new Audio();
    a.src = url;
    a.addEventListener("loadedmetadata", () => resolve(a.duration || 0), { once: true });
    a.addEventListener("error", () => resolve(0), { once: true });
  });
