import type { InstrumentKind, Waveform } from "../types/project";

export const INSTRUMENT_LABELS: Record<InstrumentKind, string> = {
  basic: "ベーシック",
  bright: "ブライト",
  warm: "ウォーム",
  lead: "リード",
  bass: "ベース",
  pad: "パッド",
  pluck: "プラック",
  organ: "オルガン",
  drumKit: "ドラムキット",
  perc: "パーカッション",
};

export const instrumentDisplayName = (kind: InstrumentKind | undefined, fallback: string) =>
  kind ? INSTRUMENT_LABELS[kind] : fallback;

export const WAVEFORM_LABELS: Record<Waveform, string> = {
  sine: "サイン波",
  saw: "のこぎり波",
  square: "矩形波",
  noise: "ノイズ",
};

export const ADSR_LABELS = {
  attack: "アタック",
  decay: "ディケイ",
  sustain: "サステイン",
  release: "リリース",
} as const;

export const INSTRUMENT_GROUPS: { label: string; kinds: InstrumentKind[] }[] = [
  { label: "シンセ", kinds: ["basic", "bright", "warm", "lead", "bass", "pad", "pluck", "organ"] },
  { label: "ドラム・パーカッション", kinds: ["drumKit", "perc"] },
];
