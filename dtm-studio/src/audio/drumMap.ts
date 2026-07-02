import type { InstrumentKind, SynthParams, Waveform } from "../types/project";
import type { DrumKind } from "./oscCore";

export type DrumVoice = {
  pitch: number;
  waveform: Waveform;
  adsr: Pick<SynthParams, "attack" | "decay" | "sustain" | "release">;
  drumKind: DrumKind;
};

/** GM ドラムマップ（主要パッド） */
export const DRUM_LABELS: Record<number, string> = {
  35: "キック2",
  36: "キック",
  37: "リム",
  38: "スネア",
  39: "クラップ",
  40: "スネア2",
  41: "タム",
  42: "HH",
  43: "タム",
  44: "HH",
  45: "タム",
  46: "OH",
  49: "クラッシュ",
  51: "ライド",
  57: "クラッシュ2",
};

const DRUM_VOICES: Record<number, DrumVoice> = {
  35: {
    pitch: 36,
    waveform: "sine",
    drumKind: "kick",
    adsr: { attack: 0.001, decay: 0.38, sustain: 0, release: 0.1 },
  },
  36: {
    pitch: 36,
    waveform: "sine",
    drumKind: "kick",
    adsr: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1 },
  },
  37: {
    pitch: 55,
    waveform: "noise",
    drumKind: "hat",
    adsr: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.015 },
  },
  38: {
    pitch: 60,
    waveform: "noise",
    drumKind: "snare",
    adsr: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.07 },
  },
  39: {
    pitch: 60,
    waveform: "noise",
    drumKind: "clap",
    adsr: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 },
  },
  40: {
    pitch: 62,
    waveform: "noise",
    drumKind: "snare",
    adsr: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.08 },
  },
  41: {
    pitch: 45,
    waveform: "sine",
    drumKind: "tom",
    adsr: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.09 },
  },
  42: {
    pitch: 70,
    waveform: "noise",
    drumKind: "hat",
    adsr: { attack: 0.001, decay: 0.045, sustain: 0, release: 0.025 },
  },
  43: {
    pitch: 48,
    waveform: "sine",
    drumKind: "tom",
    adsr: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.09 },
  },
  44: {
    pitch: 68,
    waveform: "noise",
    drumKind: "hat",
    adsr: { attack: 0.001, decay: 0.055, sustain: 0, release: 0.03 },
  },
  45: {
    pitch: 50,
    waveform: "sine",
    drumKind: "tom",
    adsr: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.09 },
  },
  46: {
    pitch: 72,
    waveform: "noise",
    drumKind: "openhat",
    adsr: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.11 },
  },
  49: {
    pitch: 75,
    waveform: "noise",
    drumKind: "cymbal",
    adsr: { attack: 0.001, decay: 0.65, sustain: 0, release: 0.32 },
  },
  51: {
    pitch: 78,
    waveform: "noise",
    drumKind: "cymbal",
    adsr: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.28 },
  },
  57: {
    pitch: 76,
    waveform: "noise",
    drumKind: "cymbal",
    adsr: { attack: 0.001, decay: 0.58, sustain: 0, release: 0.3 },
  },
};

export const resolveDrumVoice = (pitch: number): DrumVoice =>
  DRUM_VOICES[pitch] ?? {
    pitch,
    waveform: "noise",
    drumKind: "noise",
    adsr: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.04 },
  };

/** 単体ドラム音源：どの鍵盤を押しても同じ音（GM マップを使わない） */
const FIXED_DRUM_VOICES: Partial<Record<InstrumentKind, DrumVoice>> = {
  kick: DRUM_VOICES[36]!,
  snare: DRUM_VOICES[38]!,
  hihat: DRUM_VOICES[42]!,
  openhat: DRUM_VOICES[46]!,
  clap: DRUM_VOICES[39]!,
  tom: DRUM_VOICES[45]!,
  crash: DRUM_VOICES[49]!,
  ride: DRUM_VOICES[51]!,
};

export const fixedDrumVoice = (kind: InstrumentKind): DrumVoice | null =>
  FIXED_DRUM_VOICES[kind] ?? null;

export const drumKeyboardLabel = (pitch: number) => DRUM_LABELS[pitch] ?? null;
