export const PROJECT_VERSION = 3;
export const PIXELS_PER_SECOND = 50;
/** 左サイドバー（トラックヘッダー）幅 */
export const TRACK_HEADER_WIDTH = 250;
/** 波形エリア左パディング — ルーラー・プレイヘッド・クリップで共通 */
export const TIMELINE_PAD = 10;

/** 秒 → ワークスペース内 X 座標（px） */
export const timelineX = (seconds: number) =>
  TRACK_HEADER_WIDTH + TIMELINE_PAD + seconds * PIXELS_PER_SECOND;

/** ワークスペース内 X → 秒 */
export const timeFromTimelineX = (x: number) =>
  Math.max(0, (x - TRACK_HEADER_WIDTH - TIMELINE_PAD) / PIXELS_PER_SECOND);

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
  pitch: number;
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
  /** 再生タイミング微調整（ms）。+で遅らせ / −で早める */
  nudgeMs: number;
  tremolo: number;
}

/** タイムライン上の実効開始位置（秒） */
export const trackEffectiveOffset = (track: Pick<Track, "offset" | "nudgeMs">) =>
  track.offset + (track.nudgeMs ?? 0) / 1000;

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
  pitch: 0,
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
  nudgeMs: 0,
  tremolo: 0,
  ...partial,
});
