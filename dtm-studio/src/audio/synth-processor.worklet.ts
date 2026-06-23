/// <reference lib="webworker" />

type Waveform = "sine" | "saw" | "square";

type Adsr = { attack: number; decay: number; sustain: number; release: number };

type ScheduledNote = {
  ctxTime: number;
  pitch: number;
  velocity: number;
  durationSec: number;
  waveform: Waveform;
  adsr: Adsr;
  pan: number;
  volume: number;
  noteOffTime: number;
  triggered: boolean;
};

type Voice = {
  active: boolean;
  pitch: number;
  velocity: number;
  waveform: Waveform;
  adsr: Adsr;
  pan: number;
  volume: number;
  phase: number;
  envLevel: number;
  envStage: "a" | "d" | "s" | "r" | "off";
  noteOffAt: number;
};

const MAX_VOICES = 32;

const oscSample = (wf: Waveform, phase: number) => {
  const t = phase % (2 * Math.PI);
  if (wf === "sine") return Math.sin(t);
  if (wf === "square") return t < Math.PI ? 1 : -1;
  return 2 * (t / (2 * Math.PI)) - 1;
};

class SynthProcessor extends AudioWorkletProcessor {
  private baseCtxTime = 0;
  private samplesPlayed = 0;
  private running = false;
  private queue: ScheduledNote[] = [];
  private voices: Voice[] = Array.from({ length: MAX_VOICES }, () => ({
    active: false,
    pitch: 60,
    velocity: 100,
    waveform: "saw" as Waveform,
    adsr: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.2 },
    pan: 0,
    volume: 1,
    phase: 0,
    envLevel: 0,
    envStage: "off" as const,
    noteOffAt: Infinity,
  }));

  constructor() {
    super();
    this.port.onmessage = (ev: MessageEvent) => {
      const d = ev.data;
      if (d.type === "transport") {
        if (d.action === "start") {
          this.baseCtxTime = d.baseCtxTime;
          this.samplesPlayed = 0;
          this.running = true;
          this.queue = [];
          this.killAllVoices();
        } else if (d.action === "stop") {
          this.running = false;
          this.releaseAllVoices();
          this.queue = [];
        }
      } else if (d.type === "schedule") {
        for (const n of d.notes as Omit<ScheduledNote, "triggered">[]) {
          this.queue.push({ ...n, triggered: false });
        }
      } else if (d.type === "clearQueue") {
        this.queue = [];
      }
    };
  }

  private ctxTimeNow() {
    return this.baseCtxTime + this.samplesPlayed / sampleRate;
  }

  private killAllVoices() {
    for (const v of this.voices) {
      v.active = false;
      v.envStage = "off";
      v.envLevel = 0;
    }
  }

  private releaseAllVoices() {
    const now = this.ctxTimeNow();
    for (const v of this.voices) {
      if (v.active) v.noteOffAt = now;
    }
  }

  private allocVoice(): Voice | null {
    let free = this.voices.find((v) => !v.active);
    if (!free) free = this.voices[0];
    return free ?? null;
  }

  private triggerNote(n: ScheduledNote) {
    const v = this.allocVoice();
    if (!v) return;
    v.active = true;
    v.pitch = n.pitch;
    v.velocity = n.velocity;
    v.waveform = n.waveform;
    v.adsr = n.adsr;
    v.pan = n.pan;
    v.volume = n.volume;
    v.phase = 0;
    v.envLevel = 0;
    v.envStage = "a";
    v.noteOffAt = n.noteOffTime;
  }

  private processEnv(v: Voice, dt: number, now: number) {
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
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const outL = outputs[0]?.[0];
    const outR = outputs[0]?.[1];
    if (!outL) return true;
    const block = outL.length;
    const dt = block / sampleRate;

    if (this.running) {
      const nowStart = this.ctxTimeNow();
      for (const n of this.queue) {
        if (!n.triggered && n.ctxTime <= nowStart + dt) {
          n.triggered = true;
          this.triggerNote(n);
        }
      }
      this.queue = this.queue.filter((n) => !n.triggered || n.noteOffTime > nowStart - 1);
    }

    for (let i = 0; i < block; i++) {
      const now = this.baseCtxTime + (this.samplesPlayed + i) / sampleRate;
      let l = 0;
      let r = 0;
      for (const v of this.voices) {
        if (!v.active) continue;
        this.processEnv(v, 1 / sampleRate, now);
        if (!v.active) continue;
        const freq = 440 * Math.pow(2, (v.pitch - 69) / 12);
        v.phase += (2 * Math.PI * freq) / sampleRate;
        const amp = oscSample(v.waveform, v.phase) * v.envLevel * (v.velocity / 127) * v.volume;
        const panL = Math.cos(((v.pan + 1) * Math.PI) / 4);
        const panR = Math.sin(((v.pan + 1) * Math.PI) / 4);
        l += amp * panL;
        r += amp * panR;
      }
      outL[i] = l;
      if (outR) outR[i] = r;
    }

    this.samplesPlayed += block;
    return true;
  }
}

registerProcessor("dtm-synth", SynthProcessor);
export {};
