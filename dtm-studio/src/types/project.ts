/** プロジェクトファイル形式バージョン（将来クラウド同期用に id / updatedAt を必須化） */
export const PROJECT_VERSION = 1;

export type Waveform = "sine" | "saw" | "square";

export type SynthParams = {
  waveform: Waveform;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
};

export type InstrumentKind = "basic" | "bright" | "warm";

export type Instrument = {
  id: string;
  kind: InstrumentKind;
  name: string;
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
    params: { waveform: "saw", attack: 0.01, decay: 0.15, sustain: 0.6, release: 0.2 },
  },
  {
    id: "inst-bright",
    kind: "bright",
    name: "ブライト",
    params: { waveform: "square", attack: 0.005, decay: 0.1, sustain: 0.4, release: 0.15 },
  },
  {
    id: "inst-warm",
    kind: "warm",
    name: "ウォーム",
    params: { waveform: "sine", attack: 0.02, decay: 0.2, sustain: 0.75, release: 0.35 },
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
