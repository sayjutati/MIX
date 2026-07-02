import type { InstrumentKind } from "../types/project";
import type { OscWaveform } from "./oscCore";

/** 1オシレーターレイヤー */
export type OscLayer = {
  waveform: OscWaveform;
  /** セント単位のデチューン（100 = 半音） */
  detuneCents: number;
  /** オクターブシフト */
  octave: number;
  /** ミックスレベル 0〜1 */
  level: number;
};

/** マルチオシレーター音源パッチ（postMessage 可能なプレーンデータ） */
export type VoicePatch = {
  oscs: OscLayer[];
  filter?: {
    cutoffHz: number;
    /** エンベロープでカットオフを開く量（オクターブ） */
    envOctaves: number;
    envDecaySec: number;
    /** 1/Q。小さいほどレゾナンス強（0.4〜1.4 目安） */
    damp: number;
    /** 音程追従 0〜1（1 = ピッチに完全追従） */
    keyTrack?: number;
  };
  /** アタックのピッチ下降（808 キック系） */
  pitchEnv?: { semitones: number; decaySec: number };
  vibrato?: { rateHz: number; cents: number; delaySec: number };
  /** ブレスノイズ等 0〜1 */
  noiseLevel?: number;
};

const L = (
  waveform: OscWaveform,
  detuneCents: number,
  octave: number,
  level: number
): OscLayer => ({ waveform, detuneCents, octave, level });

/**
 * 楽器種別ごとの音作り。
 * 旧来の basic〜organ は SynthPanel で波形を編集できる単一オシレーター方式を
 * 維持するため、ここには含めない（新楽器のみパッチ音源）。
 */
export const SYNTH_PATCHES: Partial<Record<InstrumentKind, VoicePatch>> = {
  piano: {
    oscs: [L("triangle", 0, 0, 0.68), L("saw", 4, 0, 0.2), L("sine", 0, 1, 0.14)],
    filter: { cutoffHz: 1700, envOctaves: 1.6, envDecaySec: 0.4, damp: 1.0, keyTrack: 0.6 },
  },
  epiano: {
    oscs: [L("sine", 0, 0, 0.72), L("sine", 3, 1, 0.2), L("triangle", -5, 0, 0.22)],
    filter: { cutoffHz: 2600, envOctaves: 0.9, envDecaySec: 0.5, damp: 1.1 },
  },
  strings: {
    oscs: [L("saw", -11, 0, 0.36), L("saw", 0, 0, 0.36), L("saw", 9, 0, 0.36)],
    filter: { cutoffHz: 5200, envOctaves: 0, envDecaySec: 0.3, damp: 1.2 },
    vibrato: { rateHz: 5.2, cents: 12, delaySec: 0.28 },
  },
  brass: {
    oscs: [L("saw", 0, 0, 0.58), L("saw", 8, 0, 0.34)],
    filter: { cutoffHz: 1100, envOctaves: 1.9, envDecaySec: 0.16, damp: 0.9 },
  },
  flute: {
    oscs: [L("sine", 0, 0, 0.82), L("triangle", 0, 1, 0.08)],
    vibrato: { rateHz: 5.4, cents: 10, delaySec: 0.3 },
    noiseLevel: 0.05,
  },
  bell: {
    // 非整数倍音（+19半音 ≒ 3倍音）で金属感を出す
    oscs: [L("sine", 0, 0, 0.55), L("sine", 2, 2, 0.3), L("sine", 702, 1, 0.24)],
  },
  marimba: {
    oscs: [L("sine", 0, 0, 0.8), L("sine", 3, 2, 0.22)],
    filter: { cutoffHz: 3400, envOctaves: 0.6, envDecaySec: 0.12, damp: 1.0, keyTrack: 0.5 },
  },
  guitar: {
    oscs: [L("saw", 0, 0, 0.5), L("triangle", 2, 0, 0.4)],
    filter: { cutoffHz: 2000, envOctaves: 1.3, envDecaySec: 0.13, damp: 0.8, keyTrack: 0.4 },
  },
  bass808: {
    oscs: [L("sine", 0, 0, 0.95)],
    pitchEnv: { semitones: 14, decaySec: 0.05 },
    filter: { cutoffHz: 900, envOctaves: 0.4, envDecaySec: 0.15, damp: 1.0 },
  },
  supersaw: {
    oscs: [L("saw", -18, 0, 0.34), L("saw", 0, 0, 0.4), L("saw", 18, 0, 0.34)],
    filter: { cutoffHz: 7200, envOctaves: 0.5, envDecaySec: 0.3, damp: 1.2 },
  },
};

export const patchForKind = (kind: InstrumentKind): VoicePatch | null =>
  SYNTH_PATCHES[kind] ?? null;
