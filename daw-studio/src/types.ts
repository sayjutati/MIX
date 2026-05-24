export const PROJECT_VERSION = 2;
export const PIXELS_PER_SECOND = 50;

export type TrackKind = "bgm" | "vocal";

export interface Track {
  id: number;
  url: string;
  name: string;
  color: string;
  kind: TrackKind;
  volume: number;
  pan: number;
  speed: number;
  bass: number;
  treble: number;
  noiseReduce: number;
  compressor: number;
  chorus: number;
  delay: number;
  reverb: number;
  fadeIn: number;
  fadeOut: number;
  duration: number;
  isSolo: boolean;
  isMuted: boolean;
  offset: number;
  tremolo: number;
}

export interface ProjectFile {
  version: number;
  bpm: number;
  masterVolume: number;
  globalTime?: number;
  tracks: (Track & { audioData?: string })[];
}

export const TRACK_COLORS = [
  "#e74c3c",
  "#9b59b6",
  "#3498db",
  "#1abc9c",
  "#f1c40f",
  "#e67e22",
];

export const defaultTrack = (
  partial: Partial<Track> & Pick<Track, "id" | "url" | "name">
): Track => ({
  color: TRACK_COLORS[0],
  kind: "vocal",
  volume: 0.8,
  pan: 0,
  speed: 1,
  bass: 0,
  treble: 0,
  noiseReduce: 0,
  compressor: 0,
  chorus: 0,
  delay: 0,
  reverb: 0,
  fadeIn: 0,
  fadeOut: 0,
  duration: 0,
  isSolo: false,
  isMuted: false,
  offset: 0,
  tremolo: 0,
  ...partial,
});
