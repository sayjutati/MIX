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
  piano: "ピアノ",
  epiano: "エレピ",
  strings: "ストリングス",
  brass: "ブラス",
  flute: "フルート",
  bell: "ベル",
  marimba: "マリンバ",
  guitar: "ギター",
  bass808: "808ベース",
  supersaw: "スーパーソー",
  drumKit: "ドラムキット",
  kick: "キック",
  snare: "スネア",
  hihat: "ハイハット",
  openhat: "オープンハット",
  clap: "クラップ",
  tom: "タム",
  crash: "クラッシュ",
  ride: "ライド",
  perc: "パーカッション",
  voice: "自分の声",
};

export const instrumentDisplayName = (kind: InstrumentKind | undefined, fallback: string) =>
  kind ? INSTRUMENT_LABELS[kind] : fallback;

export const WAVEFORM_LABELS: Record<Waveform, string> = {
  sine: "サイン波",
  saw: "のこぎり波",
  square: "矩形波",
  triangle: "三角波",
  noise: "ノイズ",
};

export const ADSR_LABELS = {
  attack: "アタック",
  decay: "ディケイ",
  sustain: "サステイン",
  release: "リリース",
} as const;

export const INSTRUMENT_GROUPS: { label: string; kinds: InstrumentKind[] }[] = [
  {
    label: "鍵盤・メロディ",
    kinds: ["piano", "epiano", "organ", "bell", "marimba", "guitar", "flute"],
  },
  {
    label: "シンセ",
    kinds: ["basic", "bright", "warm", "lead", "supersaw", "pad", "pluck"],
  },
  {
    label: "ベース",
    kinds: ["bass", "bass808"],
  },
  {
    label: "ストリングス・ブラス",
    kinds: ["strings", "brass"],
  },
  {
    label: "ドラム・パーカッション",
    kinds: ["drumKit", "kick", "snare", "hihat", "openhat", "clap", "tom", "crash", "ride", "perc"],
  },
  {
    label: "ボイス（録音サンプラー）",
    kinds: ["voice"],
  },
];
