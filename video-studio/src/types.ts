export const PROJECT_VERSION = 2;
export const PIXELS_PER_SECOND = 40;
export const MIN_PX_PER_SEC = 8;
export const MAX_PX_PER_SEC = 200;
export const TRACK_HEADER_WIDTH = 200;
export const TIMELINE_PAD = 0;
export const DEFAULT_FPS = 30;
export const SNAP_GRID_SEC = 0.25;

export const timelineX = (seconds: number, pps: number = PIXELS_PER_SECOND) =>
  TRACK_HEADER_WIDTH + TIMELINE_PAD + seconds * pps;

export const timeFromTimelineX = (x: number, pps: number = PIXELS_PER_SECOND) =>
  Math.max(0, (x - TRACK_HEADER_WIDTH - TIMELINE_PAD) / pps);

export type TrackKind = "video" | "audio" | "text" | "overlay";

export type MediaKind = "video" | "audio" | "image";

/** クリップ音声の出所（DAWミックス ≠ 動画内蔵音声） */
export type ClipOrigin = "media" | "daw" | "video-linked";

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  url: string;
  duration: number;
  width?: number;
  height?: number;
  /** 動画ファイルに音声ストリームがあるか */
  hasAudio?: boolean;
}

export interface ClipEffects {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  grayscale: number;
  sepia: number;
}

export const defaultEffects = (): ClipEffects => ({
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  grayscale: 0,
  sepia: 0,
});

export interface OpacityKeyframe {
  id: string;
  /** クリップ内の相対秒 */
  t: number;
  value: number;
}

export type TransitionKind = "none" | "crossfade";

export interface ClipTransition {
  kind: TransitionKind;
  /** 秒 */
  duration: number;
}

export interface TimelineClip {
  id: string;
  assetId: string;
  trackId: string;
  /** タイムライン上の開始秒 */
  start: number;
  /** タイムライン上の表示長（速度反映後） */
  duration: number;
  /** ソース内トリム開始秒 */
  inPoint: number;
  speed: number;
  volume: number;
  opacity: number;
  /** クリップ単体の音声ミュート（映像はそのまま） */
  audioMuted: boolean;
  effects: ClipEffects;
  transitionOut?: ClipTransition;
  opacityKeyframes: OpacityKeyframe[];
  /** 音声の出所ラベル */
  origin?: ClipOrigin;
  /** 動画クリップ↔音声クリップの同期リンク */
  linkedClipId?: string;
}

export interface TextClip extends TimelineClip {
  text: string;
  fontSize: number;
  color: string;
  /** 0–1 正規化 */
  x: number;
  y: number;
  fontFamily: string;
}

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  color: string;
  height: number;
  locked: boolean;
  muted: boolean;
  hidden: boolean;
  solo: boolean;
  /** トラック音量 0–2 */
  volume: number;
  clips: TimelineClip[];
}

export interface EditorState {
  title: string;
  assets: MediaAsset[];
  tracks: Track[];
  clips: TimelineClip[];
  textClips: TextClip[];
  duration: number;
  pxPerSec: number;
  playhead: number;
  isPlaying: boolean;
  loopA: number | null;
  loopB: number | null;
  snapEnabled: boolean;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  previewWidth: number;
  previewHeight: number;
  /** マスター音量 0–2 */
  masterVolume: number;
  /** 全体の音声モニター ON/OFF */
  audioEnabled: boolean;
}

export const clipSourceDuration = (clip: TimelineClip) =>
  clip.duration * (clip.speed || 1);

export const clipTimelineEnd = (clip: TimelineClip) => clip.start + clip.duration;

export const clipOpacityAt = (clip: TimelineClip, localSec: number): number => {
  const kfs = [...clip.opacityKeyframes].sort((a, b) => a.t - b.t);
  if (kfs.length === 0) return clip.opacity;
  if (localSec <= kfs[0].t) return kfs[0].value;
  for (let i = 1; i < kfs.length; i++) {
    const prev = kfs[i - 1];
    const cur = kfs[i];
    if (localSec <= cur.t) {
      const span = cur.t - prev.t || 1;
      const f = (localSec - prev.t) / span;
      return prev.value + (cur.value - prev.value) * f;
    }
  }
  return kfs[kfs.length - 1].value;
};

export const projectDuration = (clips: TimelineClip[], textClips: TextClip[]) => {
  let max = 0;
  for (const c of [...clips, ...textClips]) {
    max = Math.max(max, clipTimelineEnd(c));
  }
  return Math.max(max, 1);
};

export const createDefaultTracks = (): Track[] => [
  { id: "v1", name: "Video 1", kind: "video", color: "#4f8cf7", height: 80, locked: false, muted: false, hidden: false, solo: false, volume: 1, clips: [] },
  { id: "v2", name: "Video 2", kind: "video", color: "#6366f1", height: 80, locked: false, muted: false, hidden: false, solo: false, volume: 1, clips: [] },
  { id: "a1", name: "Audio 1（主音声）", kind: "audio", color: "#22c55e", height: 64, locked: false, muted: false, hidden: false, solo: false, volume: 1, clips: [] },
  { id: "a2", name: "Audio 2（BGM/DAW）", kind: "audio", color: "#34d399", height: 64, locked: false, muted: false, hidden: false, solo: false, volume: 1, clips: [] },
  { id: "t1", name: "Titles", kind: "text", color: "#f59e0b", height: 40, locked: false, muted: false, hidden: false, solo: false, volume: 1, clips: [] },
  { id: "o1", name: "Overlay", kind: "overlay", color: "#ec4899", height: 48, locked: false, muted: false, hidden: false, solo: false, volume: 1, clips: [] },
];

export const initialEditorState = (): EditorState => ({
  title: "無題のプロジェクト",
  assets: [],
  tracks: createDefaultTracks(),
  clips: [],
  textClips: [],
  duration: 30,
  pxPerSec: PIXELS_PER_SECOND,
  playhead: 0,
  isPlaying: false,
  loopA: null,
  loopB: null,
  snapEnabled: true,
  selectedClipId: null,
  selectedTrackId: null,
  previewWidth: 1280,
  previewHeight: 720,
  masterVolume: 1,
  audioEnabled: true,
});

export interface SerializedAsset {
  id: string;
  name: string;
  kind: MediaKind;
  duration: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  data: string;
}

export interface SerializedClip {
  id: string;
  assetId: string;
  trackId: string;
  start: number;
  duration: number;
  inPoint: number;
  speed: number;
  volume: number;
  opacity: number;
  effects: ClipEffects;
  transitionOut?: ClipTransition;
  opacityKeyframes: OpacityKeyframe[];
  text?: string;
  fontSize?: number;
  color?: string;
  x?: number;
  y?: number;
  fontFamily?: string;
  audioMuted?: boolean;
  origin?: ClipOrigin;
  linkedClipId?: string;
}

export interface ProjectFile {
  version: number;
  title: string;
  assets: SerializedAsset[];
  tracks: Omit<Track, "clips">[];
  clips: SerializedClip[];
  duration: number;
  previewWidth: number;
  previewHeight: number;
  pxPerSec: number;
  masterVolume?: number;
  audioEnabled?: boolean;
}
