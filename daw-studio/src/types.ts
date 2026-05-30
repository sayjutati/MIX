export const PROJECT_VERSION = 5;
/** 既定のズーム（1秒あたりのpx） */
export const PIXELS_PER_SECOND = 50;
export const MIN_PX_PER_SEC = 12;
export const MAX_PX_PER_SEC = 320;
/** 左サイドバー（トラックヘッダー）幅 */
export const TRACK_HEADER_WIDTH = 250;
/** 波形エリア左パディング — ルーラー・プレイヘッド・クリップで共通（0で原点を揃える） */
export const TIMELINE_PAD = 0;

/** 秒 → ワークスペース内 X 座標（px） */
export const timelineX = (seconds: number, pps: number = PIXELS_PER_SECOND) =>
  TRACK_HEADER_WIDTH + TIMELINE_PAD + seconds * pps;

/** ワークスペース内 X → 秒 */
export const timeFromTimelineX = (x: number, pps: number = PIXELS_PER_SECOND) =>
  Math.max(0, (x - TRACK_HEADER_WIDTH - TIMELINE_PAD) / pps);

export type TrackKind = "bgm" | "vocal";

/** ピッチ編集の1ノート（クリップ内ローカル秒・MIDIノート番号） */
export interface PitchNote {
  id: number;
  /** クリップ内の開始秒 */
  start: number;
  /** クリップ内の終了秒 */
  end: number;
  /** 検出された基準ピッチ（MIDIノート番号、四捨五入前の中央値） */
  midi: number;
  /** ユーザーによる補正量（半音、±limit にクランプ） */
  shift: number;
}

/** 1つの音声クリップ（テイク）。1レーンに複数並べられる。 */
export interface Clip {
  id: number;
  url: string;
  /** レーン上の開始位置（秒） */
  offset: number;
  /** 素材の長さ（秒） */
  duration: number;
  /** ピッチ補正前の元音声（非破壊編集用）。未補正なら未設定 */
  originalUrl?: string;
  /** 検出＋編集されたピッチノート列。未解析なら未設定 */
  notes?: PitchNote[];
}

/** トラック = レーン。FX・音量・Solo/Mute はレーン共通。 */
export interface Track {
  id: number;
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
  isSolo: boolean;
  isMuted: boolean;
  /** 再生タイミング微調整（ms）。+で遅らせ / −で早める。レーン共通 */
  nudgeMs: number;
  tremolo: number;
  /** ディエッサー量（0〜1）。歯擦音（サ行のシャリ）を動的に抑制 */
  deEss: number;
  clips: Clip[];
}

/** クリップの実効開始位置（秒）＝ offset + nudge */
export const clipEffectiveOffset = (track: Pick<Track, "nudgeMs">, clip: Pick<Clip, "offset">) =>
  clip.offset + (track.nudgeMs ?? 0) / 1000;

/** クリップのタイムライン上の再生長（速度反映後の秒） */
export const clipPlayDuration = (track: Pick<Track, "speed">, clip: Pick<Clip, "duration">) =>
  (clip.duration || 0) / (track.speed || 1);

/** レーンの末尾（タイムライン秒） */
export const trackTimelineEnd = (track: Track) =>
  track.clips.reduce(
    (max, c) => Math.max(max, clipEffectiveOffset(track, c) + clipPlayDuration(track, c)),
    0
  );

/**
 * 緑プレイヘッドの X 座標（px）。
 * globalTime を含むクリップがあれば、その波形の白線と一致する位置を返す。
 */
export const playheadVisualX = (
  globalTime: number,
  track?: Track,
  pps: number = PIXELS_PER_SECOND
) => {
  if (!track) return timelineX(globalTime, pps);
  for (const clip of track.clips) {
    const start = clipEffectiveOffset(track, clip);
    const playDur = clipPlayDuration(track, clip);
    if (playDur > 0 && globalTime >= start && globalTime <= start + playDur) {
      const local = globalTime - start;
      const waveLocal = Math.max(0, local * (track.speed ?? 1));
      return TRACK_HEADER_WIDTH + TIMELINE_PAD + clip.offset * pps + waveLocal * pps;
    }
  }
  return timelineX(globalTime, pps);
};

export interface ProjectClip extends Clip {
  audioData?: string;
  /** originalUrl の音声データ（base64） */
  originalAudioData?: string;
}

export interface ProjectTrack extends Omit<Track, "clips"> {
  clips?: ProjectClip[];
  /** 旧フォーマット（v3 以前）の単一クリップ用 */
  url?: string;
  offset?: number;
  duration?: number;
  audioData?: string;
}

export interface ProjectFile {
  version: number;
  bpm: number;
  masterVolume: number;
  globalTime?: number;
  tracks: ProjectTrack[];
}

export const TRACK_COLORS = [
  "#e74c3c",
  "#9b59b6",
  "#3498db",
  "#1abc9c",
  "#f1c40f",
  "#e67e22",
];

let clipSeq = 0;
const nextClipId = () => Date.now() * 1000 + (clipSeq++ % 1000);

export const makeClip = (opts: { id?: number; url: string; offset?: number; duration?: number }): Clip => ({
  id: opts.id ?? nextClipId(),
  url: opts.url,
  offset: opts.offset ?? 0,
  duration: opts.duration ?? 0,
});

const FX_DEFAULTS = {
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
  isSolo: false,
  isMuted: false,
  nudgeMs: 0,
  tremolo: 0,
  deEss: 0,
};

/** 1クリップを持つ新規レーンを作成 */
export const createTrack = (opts: {
  id: number;
  name: string;
  url: string;
  kind?: TrackKind;
  color?: string;
  offset?: number;
  duration?: number;
}): Track => ({
  id: opts.id,
  name: opts.name,
  color: opts.color ?? TRACK_COLORS[0],
  kind: opts.kind ?? "vocal",
  ...FX_DEFAULTS,
  clips: [makeClip({ url: opts.url, offset: opts.offset, duration: opts.duration })],
});

/** レーンの FX 既定値（読込時の補完用） */
export const trackFxDefaults = () => ({ ...FX_DEFAULTS });
