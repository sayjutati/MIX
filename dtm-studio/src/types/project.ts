/** プロジェクトファイル形式バージョン（将来クラウド同期用に id / updatedAt を必須化） */
export const PROJECT_VERSION = 2;

export type TrackKind = "midi" | "audio";

export type Waveform = "sine" | "saw" | "square" | "noise";

export type SynthParams = {
  waveform: Waveform;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
};

export type InstrumentEngine = "synth" | "drum";

export type InstrumentKind =
  | "basic"
  | "bright"
  | "warm"
  | "lead"
  | "bass"
  | "pad"
  | "pluck"
  | "organ"
  | "drumKit"
  | "perc";

export type Instrument = {
  id: string;
  kind: InstrumentKind;
  name: string;
  /** 省略時は synth（旧プロジェクト互換） */
  engine?: InstrumentEngine;
  params: SynthParams;
};

export type MidiNote = {
  id: string;
  pitch: number;
  /** 拍位置（4/4 なら 1.0 = 4分音符1個分） */
  start: number;
  duration: number;
  velocity: number;
};

/** オーディオクリップ（波形トラック上の区間） */
export type AudioClip = {
  id: string;
  /** IndexedDB 上のオーディオアセット ID */
  assetId: string;
  name: string;
  /** タイムライン上の開始拍 */
  startBeat: number;
  /** ソース内トリム開始（秒） */
  trimStart: number;
  /** 再生長（秒） */
  durationSec: number;
};

/** トラック内ビルトイン FX（0〜1） */
export type TrackFx = {
  reverb: number;
  delay: number;
  delayTime: number;
  eqLow: number;
  eqHigh: number;
  compressor: number;
};

/** 外部 AudioWorklet プラグインスロット */
export type PluginSlot = {
  id: string;
  name: string;
  enabled: boolean;
  /** ビルトイン: "builtin:reverb" 等 / 外部: "external" */
  pluginId: string;
  workletUrl?: string;
  processorName?: string;
  params: Record<string, number>;
};

export const DEFAULT_TRACK_FX: TrackFx = {
  reverb: 0,
  delay: 0,
  delayTime: 0.25,
  eqLow: 0,
  eqHigh: 0,
  compressor: 0,
};

export const isAudioTrack = (t: Track) => (t.kind ?? "midi") === "audio";
export const isMidiTrack = (t: Track) => (t.kind ?? "midi") === "midi";

export type Track = {
  id: string;
  name: string;
  color: string;
  /** 省略時 midi（旧プロジェクト互換） */
  kind?: TrackKind;
  instrumentId: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  notes: MidiNote[];
  /** オーディオトラック用クリップ */
  clips?: AudioClip[];
  fx?: TrackFx;
  plugins?: PluginSlot[];
};

export type TimeSignature = {
  numerator: number;
  denominator: number;
};

export type Project = {
  id: string;
  version: number;
  name: string;
  createdAt: number;
  updatedAt: number;
  tempo: number;
  timeSignature: TimeSignature;
  loopStart: number;
  loopEnd: number;
  /** マスター出力 0〜1 */
  masterVolume: number;
  tracks: Track[];
  instruments: Instrument[];
};

export const DEFAULT_INSTRUMENTS: Instrument[] = [
  {
    id: "inst-basic",
    kind: "basic",
    name: "ベーシック",
    engine: "synth",
    params: { waveform: "saw", attack: 0.012, decay: 0.18, sustain: 0.55, release: 0.22 },
  },
  {
    id: "inst-bright",
    kind: "bright",
    name: "ブライト",
    engine: "synth",
    params: { waveform: "saw", attack: 0.008, decay: 0.14, sustain: 0.45, release: 0.18 },
  },
  {
    id: "inst-warm",
    kind: "warm",
    name: "ウォーム",
    engine: "synth",
    params: { waveform: "sine", attack: 0.02, decay: 0.2, sustain: 0.75, release: 0.35 },
  },
  {
    id: "inst-lead",
    kind: "lead",
    name: "リード",
    engine: "synth",
    params: { waveform: "saw", attack: 0.006, decay: 0.14, sustain: 0.5, release: 0.2 },
  },
  {
    id: "inst-bass",
    kind: "bass",
    name: "ベース",
    engine: "synth",
    params: { waveform: "saw", attack: 0.012, decay: 0.22, sustain: 0.65, release: 0.18 },
  },
  {
    id: "inst-pad",
    kind: "pad",
    name: "パッド",
    engine: "synth",
    params: { waveform: "sine", attack: 0.08, decay: 0.3, sustain: 0.85, release: 0.4 },
  },
  {
    id: "inst-pluck",
    kind: "pluck",
    name: "プラック",
    engine: "synth",
    params: { waveform: "square", attack: 0.001, decay: 0.22, sustain: 0.08, release: 0.14 },
  },
  {
    id: "inst-organ",
    kind: "organ",
    name: "オルガン",
    engine: "synth",
    params: { waveform: "square", attack: 0.02, decay: 0.05, sustain: 0.9, release: 0.08 },
  },
  {
    id: "inst-drum",
    kind: "drumKit",
    name: "ドラムキット",
    engine: "drum",
    params: { waveform: "noise", attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
  },
  {
    id: "inst-perc",
    kind: "perc",
    name: "パーカッション",
    engine: "drum",
    params: { waveform: "noise", attack: 0.001, decay: 0.08, sustain: 0, release: 0.04 },
  },
];

export const makeNote = (partial: Partial<MidiNote> & Pick<MidiNote, "pitch" | "start">): MidiNote => ({
  id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  duration: 1,
  velocity: 100,
  ...partial,
});

export const makeAudioClip = (
  partial: Partial<AudioClip> & Pick<AudioClip, "assetId" | "startBeat" | "durationSec">
): AudioClip => ({
  id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: "クリップ",
  trimStart: 0,
  ...partial,
});

export const normalizeTrack = (t: Track): Track => ({
  ...t,
  kind: t.kind ?? "midi",
  notes: t.notes ?? [],
  clips: t.clips ?? [],
  fx: { ...DEFAULT_TRACK_FX, ...(t.fx ?? {}) },
  plugins: t.plugins ?? [],
});

export const makeTrack = (partial?: Partial<Track>): Track =>
  normalizeTrack({
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: "トラック 1",
    color: "#6c8cff",
    kind: "midi",
    instrumentId: "inst-basic",
    volume: 0.85,
    pan: 0,
    muted: false,
    solo: false,
    notes: [],
    clips: [],
    fx: { ...DEFAULT_TRACK_FX },
    plugins: [],
    ...partial,
  });

export const makeAudioTrack = (partial?: Partial<Track>): Track =>
  makeTrack({
    kind: "audio",
    name: "オーディオ",
    instrumentId: "inst-basic",
    notes: [],
    ...partial,
  });

export const makeProject = (partial?: Partial<Project>): Project => {
  const now = Date.now();
  const raw: Project = {
    id: `p-${now}`,
    version: PROJECT_VERSION,
    name: "無題",
    createdAt: now,
    updatedAt: now,
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    loopStart: 0,
    loopEnd: 16,
    masterVolume: 0.9,
    instruments: DEFAULT_INSTRUMENTS.map((i) => ({ ...i, params: { ...i.params } })),
    tracks: [makeTrack()],
    ...partial,
  };
  return {
    ...raw,
    tracks: raw.tracks.map(normalizeTrack),
  };
};

/** 拍 → 秒 */
export const beatToSec = (beat: number, tempo: number) => (beat * 60) / tempo;

/** 秒 → 拍 */
export const secToBeat = (sec: number, tempo: number) => (sec * tempo) / 60;

export const midiToFreq = (pitch: number) => 440 * Math.pow(2, (pitch - 69) / 12);
