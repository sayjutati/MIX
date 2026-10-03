import type { MelodyVoiceId, PitchNote } from "../types";
import { DEFAULT_MELODY_VOICE } from "../types";
import { midiToFreq } from "./pitch";

export const MAJOR_PCS = [0, 2, 4, 5, 7, 9, 11];
export const MINOR_PCS = [0, 2, 3, 5, 7, 8, 10];

export type ScaleKind = "major" | "minor";
export type KeyGuess = { rootPc: number; kind: ScaleKind; name: string };

const NOTE_PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const scaleOf = (kind: ScaleKind) => (kind === "major" ? MAJOR_PCS : MINOR_PCS);

export const snapSecToGrid = (sec: number, bpm: number, gridBeats: number) => {
  if (gridBeats <= 0 || bpm <= 0) return Math.max(0, sec);
  const beat = (sec * bpm) / 60;
  return (Math.round(beat / gridBeats) * gridBeats * 60) / bpm;
};

export const inferKey = (notes: Pick<PitchNote, "midi" | "start" | "end">[]): KeyGuess => {
  let best: KeyGuess & { score: number } = {
    rootPc: 0,
    kind: "major",
    name: "C メジャー",
    score: -Infinity,
  };
  if (!notes.length) return { rootPc: 0, kind: "major", name: "C メジャー" };

  for (const kind of ["major", "minor"] as const) {
    const scale = scaleOf(kind);
    for (let root = 0; root < 12; root++) {
      let score = 0;
      for (const n of notes) {
        const pc = (((Math.round(n.midi) - root) % 12) + 12) % 12;
        const w = Math.max(0.05, n.end - n.start);
        score += scale.includes(pc) ? w : -w * 0.45;
      }
      if (score > best.score) {
        const label = kind === "major" ? "メジャー" : "マイナー";
        best = { rootPc: root, kind, name: `${NOTE_PC[root]} ${label}`, score };
      }
    }
  }
  return { rootPc: best.rootPc, kind: best.kind, name: best.name };
};

const nearestScaleMidi = (midi: number, rootPc: number, kind: ScaleKind) => {
  const scale = scaleOf(kind);
  const rounded = Math.round(midi);
  let best = rounded;
  let bestDist = 99;
  for (let d = -6; d <= 6; d++) {
    const cand = rounded + d;
    const pc = (((cand - rootPc) % 12) + 12) % 12;
    if (!scale.includes(pc)) continue;
    const dist = Math.abs(d);
    if (dist < bestDist) {
      bestDist = dist;
      best = cand;
    }
  }
  return best;
};

/** 拍グリッドに揃え、短すぎるノートを捨てる */
export const quantizeMelodyNotes = (
  notes: PitchNote[],
  bpm: number,
  gridBeats: number
): PitchNote[] => {
  const minLen = gridBeats > 0 ? (gridBeats * 60) / bpm : 0.08;
  return notes
    .filter((n) => n.end - n.start >= Math.min(0.06, minLen * 0.45))
    .map((n, i) => {
      const start = Math.max(0, snapSecToGrid(n.start, bpm, gridBeats));
      let end = snapSecToGrid(n.end, bpm, gridBeats);
      if (end <= start) end = start + minLen;
      return {
        ...n,
        id: n.id || i + 1,
        start,
        end,
        midi: Math.round(n.midi),
        shift: 0,
      };
    })
    .filter((n) => n.end - n.start >= minLen * 0.9);
};

export const snapMelodyToKey = (notes: PitchNote[], key: KeyGuess): PitchNote[] =>
  notes.map((n) => ({ ...n, midi: nearestScaleMidi(n.midi, key.rootPc, key.kind), shift: 0 }));

type VoiceLayer = {
  type: OscillatorType;
  /** 基音に対する周波数比（2 = 1オクターブ上） */
  ratio: number;
  gain: number;
  detune?: number;
};

type VoiceSpec = {
  layers: VoiceLayer[];
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  peak: number;
  lp: number;
  /** 鳴らす MIDI に足す半音（ベースは 1 オクターブ下） */
  transpose?: number;
  /** true なら鍵盤を離しても減衰し続ける（ベル） */
  perc?: boolean;
};

const VOICE_SPEC: Record<MelodyVoiceId, VoiceSpec> = {
  piano: {
    layers: [
      { type: "triangle", ratio: 1, gain: 1 },
      { type: "sine", ratio: 2, gain: 0.18 },
    ],
    attack: 0.008,
    decay: 0.28,
    sustain: 0.18,
    release: 0.14,
    peak: 0.24,
    lp: 3200,
  },
  organ: {
    layers: [
      { type: "square", ratio: 1, gain: 0.55 },
      { type: "sine", ratio: 1, gain: 0.55, detune: 7 },
      { type: "sine", ratio: 2, gain: 0.22 },
    ],
    attack: 0.02,
    decay: 0.06,
    sustain: 0.85,
    release: 0.08,
    peak: 0.16,
    lp: 1600,
  },
  strings: {
    layers: [
      { type: "sawtooth", ratio: 1, gain: 0.7 },
      { type: "sawtooth", ratio: 1, gain: 0.5, detune: -8 },
    ],
    attack: 0.14,
    decay: 0.2,
    sustain: 0.7,
    release: 0.28,
    peak: 0.14,
    lp: 1400,
  },
  bass: {
    layers: [
      { type: "sine", ratio: 1, gain: 1 },
      { type: "triangle", ratio: 1, gain: 0.35 },
    ],
    attack: 0.01,
    decay: 0.12,
    sustain: 0.55,
    release: 0.1,
    peak: 0.32,
    lp: 700,
    transpose: -12,
  },
  bell: {
    layers: [
      { type: "sine", ratio: 1, gain: 1 },
      { type: "sine", ratio: 2.76, gain: 0.28 },
    ],
    attack: 0.004,
    decay: 0.45,
    sustain: 0.04,
    release: 0.35,
    peak: 0.22,
    lp: 4200,
    perc: true,
  },
};

export const melodyVoiceSpec = (voice: MelodyVoiceId): VoiceSpec => VOICE_SPEC[voice] ?? VOICE_SPEC[DEFAULT_MELODY_VOICE];

/** 検出ノートを選んだ音色で鳴らしたバッファ */
export const renderMelodySynth = async (
  notes: PitchNote[],
  sampleRate = 44100,
  voice: MelodyVoiceId = DEFAULT_MELODY_VOICE
): Promise<AudioBuffer> => {
  const spec = melodyVoiceSpec(voice);
  const tail = spec.perc ? 0.7 : 0.28;
  const dur = Math.max(1, ...notes.map((n) => n.end), 0) + tail;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.85;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = spec.lp;
  master.connect(lp);
  lp.connect(ctx.destination);

  for (const n of notes) {
    const midi = n.midi + (n.shift || 0) + (spec.transpose ?? 0);
    const freq = midiToFreq(midi);
    const len = Math.max(0.04, n.end - n.start);
    const attack = Math.min(spec.attack, len * 0.35);
    const decay = Math.min(spec.decay, Math.max(0.02, len * 0.45));
    const release = spec.perc ? spec.release : Math.min(spec.release, Math.max(0.04, len * 0.28));
    const peak = spec.peak;
    const sustain = Math.max(0.0002, peak * spec.sustain);
    const t0 = n.start;
    const tAtk = t0 + attack;
    const tDec = tAtk + decay;
    const tRel = spec.perc ? tDec : Math.max(tDec, n.end - release);
    const tEnd = tRel + release;
    const stopAt = tEnd + 0.02;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), tAtk);
    g.gain.exponentialRampToValueAtTime(sustain, tDec);
    if (tRel > tDec) g.gain.setValueAtTime(sustain, tRel);
    g.gain.exponentialRampToValueAtTime(0.0001, tEnd);
    g.connect(master);

    for (const layer of spec.layers) {
      const osc = ctx.createOscillator();
      osc.type = layer.type;
      osc.frequency.value = freq * layer.ratio;
      if (layer.detune) osc.detune.value = layer.detune;
      const lg = ctx.createGain();
      lg.gain.value = layer.gain;
      osc.connect(lg);
      lg.connect(g);
      osc.start(n.start);
      osc.stop(stopAt);
    }
  }

  return ctx.startRendering();
};
