/** プロジェクトファイル形式バージョン（将来クラウド同期用に id / updatedAt を必須化） */
export const PROJECT_VERSION = 1;

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

export type Track = {
  id: string;
  name: string;
  color: string;
  instrumentId: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  notes: MidiNote[];
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
  tracks: Track[];
  instruments: Instrument[];
};

export const DEFAULT_INSTRUMENTS: Instrument[] = [
  {
    id: "inst-basic",
    kind: "basic",
    name: "ベーシック",
    engine: "synth",
    params: { waveform: "saw", attack: 0.01, decay: 0.15, sustain: 0.6, release: 0.2 },
  },
  {
    id: "inst-bright",
    kind: "bright",
    name: "ブライト",
    engine: "synth",
    params: { waveform: "square", attack: 0.005, decay: 0.1, sustain: 0.4, release: 0.15 },
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
    params: { waveform: "saw", attack: 0.005, decay: 0.12, sustain: 0.55, release: 0.18 },
  },
  {
    id: "inst-bass",
    kind: "bass",
    name: "ベース",
    engine: "synth",
    params: { waveform: "saw", attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.15 },
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
    params: { waveform: "square", attack: 0.001, decay: 0.25, sustain: 0.05, release: 0.12 },
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

export const makeTrack = (partial?: Partial<Track>): Track => ({
  id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  name: "トラック 1",
  color: "#6c8cff",
  instrumentId: "inst-basic",
  volume: 0.85,
  pan: 0,
  muted: false,
  solo: false,
  notes: [],
  ...partial,
});

export const makeProject = (partial?: Partial<Project>): Project => {
  const now = Date.now();
  return {
    id: `p-${now}`,
    version: PROJECT_VERSION,
    name: "無題",
    createdAt: now,
    updatedAt: now,
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    loopStart: 0,
    loopEnd: 16,
    instruments: DEFAULT_INSTRUMENTS.map((i) => ({ ...i, params: { ...i.params } })),
    tracks: [makeTrack()],
    ...partial,
  };
};

/** 拍 → 秒 */
export const beatToSec = (beat: number, tempo: number) => (beat * 60) / tempo;

/** 秒 → 拍 */
export const secToBeat = (sec: number, tempo: number) => (sec * tempo) / 60;

export const midiToFreq = (pitch: number) => 440 * Math.pow(2, (pitch - 69) / 12);
