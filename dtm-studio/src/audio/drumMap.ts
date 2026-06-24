import type { SynthParams, Waveform } from "../types/project";

export type DrumVoice = {
  pitch: number;
  waveform: Waveform;
  adsr: Pick<SynthParams, "attack" | "decay" | "sustain" | "release">;
};

/** GM ドラムマップ（主要パッド） */
export const DRUM_LABELS: Record<number, string> = {
  35: "キック2",
  36: "キック",
  37: "リム",
  38: "スネア",
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
  35: { pitch: 31, waveform: "sine", adsr: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.08 } },
  36: { pitch: 32, waveform: "sine", adsr: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.08 } },
  37: { pitch: 55, waveform: "noise", adsr: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 } },
  38: { pitch: 60, waveform: "noise", adsr: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.06 } },
  40: { pitch: 62, waveform: "noise", adsr: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.08 } },
  41: { pitch: 45, waveform: "sine", adsr: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.08 } },
  42: { pitch: 70, waveform: "noise", adsr: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 } },
  43: { pitch: 48, waveform: "sine", adsr: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.08 } },
  44: { pitch: 68, waveform: "noise", adsr: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 } },
  45: { pitch: 50, waveform: "sine", adsr: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.08 } },
  46: { pitch: 72, waveform: "noise", adsr: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 } },
  49: { pitch: 75, waveform: "noise", adsr: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.3 } },
  51: { pitch: 78, waveform: "noise", adsr: { attack: 0.001, decay: 0.45, sustain: 0, release: 0.25 } },
  57: { pitch: 76, waveform: "noise", adsr: { attack: 0.001, decay: 0.55, sustain: 0, release: 0.28 } },
};

export const resolveDrumVoice = (pitch: number): DrumVoice =>
  DRUM_VOICES[pitch] ?? {
    pitch,
    waveform: "noise",
    adsr: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.04 },
  };

export const drumKeyboardLabel = (pitch: number) => DRUM_LABELS[pitch] ?? null;
