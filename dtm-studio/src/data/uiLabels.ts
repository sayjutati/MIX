import type { InstrumentKind, Waveform } from "../types/project";

export const INSTRUMENT_LABELS: Record<InstrumentKind, string> = {
  basic: "ベーシック",
  bright: "ブライト",
  warm: "ウォーム",
};

export const instrumentDisplayName = (kind: InstrumentKind | undefined, fallback: string) =>
  kind ? INSTRUMENT_LABELS[kind] : fallback;

export const WAVEFORM_LABELS: Record<Waveform, string> = {
  sine: "サイン波",
  saw: "のこぎり波",
  square: "矩形波",
};

export const ADSR_LABELS = {
  attack: "アタック",
  decay: "ディケイ",
  sustain: "サステイン",
  release: "リリース",
} as const;
