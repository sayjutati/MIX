import type { Waveform } from "../types/project";

export type Adsr = { attack: number; decay: number; sustain: number; release: number };

export type NoteEvent = {
  startSec: number;
  endSec: number;
  pitch: number;
  velocity: number;
  waveform: Waveform;
  adsr: Adsr;
  pan: number;
  volume: number;
};

export type VoiceState = {
  active: boolean;
  pitch: number;
  velocity: number;
  waveform: Waveform;
  adsr: Adsr;
  pan: number;
  volume: number;
  phase: number;
  noiseSeed: number;
  envLevel: number;
  envStage: "a" | "d" | "s" | "r" | "off";
  noteOffAt: number;
};

export const oscSample = (wf: Waveform, phase: number, noiseSeed: { v: number }) => {
  if (wf === "noise") {
    noiseSeed.v = (noiseSeed.v * 1664525 + 1013904223) | 0;
    return (noiseSeed.v >>> 0) / 0x7fffffff - 1;
  }
  const t = phase % (2 * Math.PI);
  if (wf === "sine") return Math.sin(t);
  if (wf === "square") return t < Math.PI ? 1 : -1;
  return 2 * (t / (2 * Math.PI)) - 1;
};

export const midiToFreq = (pitch: number) => 440 * Math.pow(2, (pitch - 69) / 12);

export const createVoice = (): VoiceState => ({
  active: false,
  pitch: 60,
  velocity: 100,
  waveform: "saw",
  adsr: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.2 },
  pan: 0,
  volume: 1,
  phase: 0,
  noiseSeed: 1,
  envLevel: 0,
  envStage: "off",
  noteOffAt: Infinity,
});

export const triggerVoice = (v: VoiceState, ev: NoteEvent) => {
  v.active = true;
  v.pitch = ev.pitch;
  v.velocity = ev.velocity;
  v.waveform = ev.waveform;
  v.adsr = ev.adsr;
  v.pan = ev.pan;
  v.volume = ev.volume;
  v.phase = 0;
  v.noiseSeed = (ev.pitch * 7919 + Math.floor(ev.startSec * 1000)) | 1;
  v.envLevel = 0;
  v.envStage = "a";
  v.noteOffAt = ev.endSec;
};

export const processVoiceEnv = (v: VoiceState, dt: number, now: number) => {
  const { attack, decay, sustain, release } = v.adsr;
  if (now >= v.noteOffAt && v.envStage !== "r" && v.envStage !== "off") {
    v.envStage = "r";
  }
  switch (v.envStage) {
    case "a": {
      v.envLevel += dt / Math.max(0.001, attack);
      if (v.envLevel >= 1) {
        v.envLevel = 1;
        v.envStage = "d";
      }
      break;
    }
    case "d": {
      v.envLevel -= dt / Math.max(0.001, decay) * (1 - sustain);
      if (v.envLevel <= sustain) {
        v.envLevel = sustain;
        v.envStage = "s";
      }
      break;
    }
    case "s":
      v.envLevel = sustain;
      break;
    case "r": {
      v.envLevel -= dt / Math.max(0.001, release);
      if (v.envLevel <= 0) {
        v.envLevel = 0;
        v.active = false;
        v.envStage = "off";
      }
      break;
    }
    default:
      break;
  }
};

export const voiceSample = (v: VoiceState, sampleRate: number): { l: number; r: number } => {
  if (!v.active) return { l: 0, r: 0 };
  const freq = midiToFreq(v.pitch);
  v.phase += (2 * Math.PI * freq) / sampleRate;
  const amp = oscSample(v.waveform, v.phase, { v: v.noiseSeed }) * v.envLevel * (v.velocity / 127) * v.volume;
  const panL = Math.cos(((v.pan + 1) * Math.PI) / 4);
  const panR = Math.sin(((v.pan + 1) * Math.PI) / 4);
  return { l: amp * panL, r: amp * panR };
};

export const MAX_VOICES = 32;

export const renderVoicesAtTime = (
  voices: VoiceState[],
  events: NoteEvent[],
  eventIdx: { i: number },
  t: number,
  sampleRate: number
): { l: number; r: number } => {
  while (eventIdx.i < events.length && events[eventIdx.i].startSec <= t) {
    const ev = events[eventIdx.i];
    let free = voices.find((v) => !v.active);
    if (!free) free = voices[0];
    if (free) triggerVoice(free, ev);
    eventIdx.i++;
  }
  const dt = 1 / sampleRate;
  let l = 0;
  let r = 0;
  for (const v of voices) {
    if (!v.active) continue;
    processVoiceEnv(v, dt, t);
    if (!v.active) continue;
    const s = voiceSample(v, sampleRate);
    l += s.l;
    r += s.r;
  }
  return { l, r };
};
