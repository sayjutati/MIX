import type { TextStyle } from "./text/textStyle";

export const PROJECT_VERSION = 4;
export const PIXELS_PER_SECOND = 48;
export const MIN_PX_PER_SEC = 6;
export const MAX_PX_PER_SEC = 320;
export const TRACK_HEADER_WIDTH = 196;
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

export type FitMode = "contain" | "cover";

export interface ClipTransform {
  /** 0–1 正規化中心アンカー */
  x: number;
  y: number;
  /** 倍率 */
  scale: number;
  /** 回転角（度） */
  rotation: number;
  /** キャンバスへのフィット方式 */
  fit: FitMode;
  /** 左右反転 */
  flipH: boolean;
}

export const defaultTransform = (): ClipTransform => ({
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  fit: "contain",
  flipH: false,
});

export const resolveTransform = (clip: Pick<TimelineClip, "transform">): ClipTransform =>
  clip.transform ? { ...defaultTransform(), ...clip.transform } : defaultTransform();

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  url: string;
  duration: number;
  mimeType?: string;
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
  transform?: ClipTransform;
  /** フェードイン秒（映像・音声共通） */
  fadeIn?: number;
  /** フェードアウト秒（映像・音声共通） */
  fadeOut?: number;
  transitionOut?: ClipTransition;
  opacityKeyframes: OpacityKeyframe[];
  /** 音声の出所ラベル */
  origin?: ClipOrigin;
  /** 動画クリップ↔音声クリップの同期リンク */
  linkedClipId?: string;
}

export interface TextClip extends TimelineClip {
  text: string;
  /** 0–1 正規化アンカー */
  x: number;
  y: number;
  style: TextStyle;
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
  /** 削除時に後ろのクリップを自動で詰めるか */
  rippleMode?: boolean;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  previewWidth: number;
  previewHeight: number;
  /** 書き出し・フレーム送り基準 FPS */
  fps?: number;
  /** マスター音量 0–2 */
  masterVolume: number;
  /** 全体の音声モニター ON/OFF */
  audioEnabled: boolean;
}

export const clipSourceDuration = (clip: TimelineClip) =>
  clip.duration * (clip.speed || 1);

export const clipTimelineEnd = (clip: TimelineClip) => clip.start + clip.duration;

/** フェードイン / フェードアウトの減衰係数 (0–1)。プレビュー・書き出しの映像/音声すべてで共有 */
export const clipFadeGainAt = (
  clip: Pick<TimelineClip, "duration" | "fadeIn" | "fadeOut">,
  localSec: number
): number => {
  const dur = Math.max(0, clip.duration);
  if (dur <= 0) return 0;
  let gain = 1;
  const fi = Math.max(0, Math.min(dur, clip.fadeIn ?? 0));
  const fo = Math.max(0, Math.min(dur, clip.fadeOut ?? 0));
  if (fi > 0 && localSec < fi) {
    gain *= Math.max(0, Math.min(1, localSec / fi));
  }
  if (fo > 0 && dur - localSec < fo) {
    gain *= Math.max(0, Math.min(1, (dur - localSec) / fo));
  }
  return gain;
};

export const clipOpacityAt = (clip: TimelineClip, localSec: number): number => {
  const kfs = [...clip.opacityKeyframes].sort((a, b) => a.t - b.t);
  let base = clip.opacity;
  if (kfs.length > 0) {
    if (localSec <= kfs[0]!.t) base = kfs[0]!.value;
    else {
      let matched = false;
      for (let i = 1; i < kfs.length; i++) {
        const prev = kfs[i - 1]!;
        const cur = kfs[i]!;
        if (localSec <= cur.t) {
          const span = cur.t - prev.t || 1;
          const f = (localSec - prev.t) / span;
          base = prev.value + (cur.value - prev.value) * f;
          matched = true;
          break;
        }
      }
      if (!matched) base = kfs[kfs.length - 1]!.value;
    }
  }
  return base * clipFadeGainAt(clip, localSec);
};

export const projectDuration = (clips: TimelineClip[], textClips: TextClip[]) => {
  let max = 0;
  for (const c of [...clips, ...textClips]) {
    max = Math.max(max, clipTimelineEnd(c));
  }
  return Math.max(max, 1);
};

/** タイムラインのスクロール作業領域（秒）：常に末尾の後ろへ余白を確保 */
export const timelineWorkspaceDuration = (state: Pick<EditorState, "duration" | "clips" | "textClips" | "playhead">) => {
  const content = projectDuration(state.clips, state.textClips);
  return Math.max(content + 12, state.playhead + 8, 20);
};

export const createDefaultTracks = (): Track[] => [
  { id: "v1", name: "映像 1（メイン）", kind: "video", color: "#4f8cf7", height: 68, locked: false, muted: false, hidden: false, solo: false, volume: 1, clips: [] },
  { id: "v2", name: "映像 2（重ね・PiP）", kind: "video", color: "#6366f1", height: 60, locked: false, muted: false, hidden: false, solo: false, volume: 1, clips: [] },
  { id: "a1", name: "音声 1（動画音 / VO）", kind: "audio", color: "#22c55e", height: 56, locked: false, muted: false, hidden: false, solo: false, volume: 1, clips: [] },
  { id: "a2", name: "音声 2（BGM / DAW）", kind: "audio", color: "#34d399", height: 56, locked: false, muted: false, hidden: false, solo: false, volume: 1, clips: [] },
  { id: "t1", name: "テロップ / 歌詞", kind: "text", color: "#f59e0b", height: 46, locked: false, muted: false, hidden: false, solo: false, volume: 1, clips: [] },
  { id: "o1", name: "オーバーレイ（画像）", kind: "overlay", color: "#ec4899", height: 50, locked: false, muted: false, hidden: false, solo: false, volume: 1, clips: [] },
];

export const initialEditorState = (): EditorState => ({
  title: "無題のプロジェクト",
  assets: [],
  tracks: createDefaultTracks(),
  clips: [],
  textClips: [],
  duration: 1,
  pxPerSec: PIXELS_PER_SECOND,
  playhead: 0,
  isPlaying: false,
  loopA: null,
  loopB: null,
  snapEnabled: true,
  rippleMode: false,
  selectedClipId: null,
  selectedTrackId: null,
  previewWidth: 1920,
  previewHeight: 1080,
  fps: DEFAULT_FPS,
  masterVolume: 1,
  audioEnabled: true,
});

export interface SerializedAsset {
  id: string;
  name: string;
  kind: MediaKind;
  mimeType?: string;
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
  transform?: ClipTransform;
  fadeIn?: number;
  fadeOut?: number;
  transitionOut?: ClipTransition;
  opacityKeyframes: OpacityKeyframe[];
  text?: string;
  x?: number;
  y?: number;
  style?: TextStyle;
  /** v2 互換 */
  fontSize?: number;
  color?: string;
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
  fps?: number;
  pxPerSec: number;
  masterVolume?: number;
  audioEnabled?: boolean;
}
