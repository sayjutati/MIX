var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/audio/oscCore.ts
var TAU = 2 * Math.PI;
var polyBlep = (t, dt) => {
  if (dt <= 0) return 0;
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
};
var bandLimitedSaw = (phase, phaseInc) => {
  const t = phase % TAU / TAU;
  const dt = phaseInc / TAU;
  let s = 2 * t - 1;
  s -= polyBlep(t, dt);
  return s;
};
var bandLimitedSquare = (phase, phaseInc) => {
  const t = phase % TAU / TAU;
  const dt = phaseInc / TAU;
  let s = t < 0.5 ? 1 : -1;
  s += polyBlep(t, dt);
  s -= polyBlep((t + 0.5) % 1, dt);
  return s;
};
var nextNoise = (seed) => {
  seed.v = seed.v * 1664525 + 1013904223 | 0;
  return (seed.v >>> 0) / 2147483647 - 1;
};
var onePoleLP = (state, input, cutoffHz, sampleRate2) => {
  const alpha = 1 - Math.exp(-TAU * cutoffHz / sampleRate2);
  state.v += alpha * (input - state.v);
  return state.v;
};
var onePoleHP = (state, input, cutoffHz, sampleRate2) => {
  const lp = { v: state.v };
  const y = onePoleLP(lp, input, cutoffHz, sampleRate2);
  state.v = lp.v;
  return input - y;
};
var softClip = (x) => {
  const t = Math.tanh(x * 1.4);
  return t * 0.95;
};
var velocityGain = (velocity) => {
  const n = Math.max(0, Math.min(127, velocity)) / 127;
  return Math.pow(n, 0.72);
};
var midiToFreq = (pitch) => 440 * Math.pow(2, (pitch - 69) / 12);
var kickFreqAt = (startSec, nowSec) => {
  const t = Math.max(0, nowSec - startSec);
  const startHz = 148;
  const endHz = 52;
  const env = Math.exp(-t / 0.028);
  return endHz + (startHz - endHz) * env;
};
var oscSampleAdv = (opts) => {
  const {
    waveform,
    phase,
    phaseInc,
    noiseSeed,
    lpState,
    hpState,
    drumKind,
    voiceStartSec = 0,
    nowSec = 0,
    sampleRate: sampleRate2 = 44100
  } = opts;
  if (drumKind === "kick") {
    const p = phase % TAU;
    return Math.sin(p) * (1 - Math.min(1, (nowSec - voiceStartSec) / 4e-3) * 0.15);
  }
  if (drumKind === "snare") {
    const tone = Math.sin(phase) * 0.38;
    const raw = nextNoise(noiseSeed);
    const lp = lpState ?? { v: 0 };
    const filtered = onePoleLP(lp, raw, 3200, sampleRate2);
    if (lpState) lpState.v = lp.v;
    return tone + filtered * 0.62;
  }
  if (drumKind === "hat") {
    const raw = nextNoise(noiseSeed);
    const hp = hpState ?? { v: 0 };
    const filtered = onePoleHP(hp, raw, 6800, sampleRate2);
    if (hpState) hpState.v = hp.v;
    return filtered * 0.85;
  }
  if (drumKind === "cymbal") {
    const raw = nextNoise(noiseSeed);
    const lp = lpState ?? { v: 0 };
    const filtered = onePoleLP(lp, raw, 9e3, sampleRate2);
    if (lpState) lpState.v = lp.v;
    return filtered * 0.9;
  }
  if (drumKind === "tom") {
    const t = Math.max(0, nowSec - voiceStartSec);
    const env = Math.exp(-t / 0.09);
    return Math.sin(phase) * (0.85 + env * 0.15);
  }
  if (waveform === "noise") {
    const raw = nextNoise(noiseSeed);
    const lp = lpState ?? { v: 0 };
    const filtered = onePoleLP(lp, raw, 4200, sampleRate2);
    if (lpState) lpState.v = lp.v;
    return filtered;
  }
  if (waveform === "sine") return Math.sin(phase % TAU);
  if (waveform === "square") return bandLimitedSquare(phase, phaseInc);
  return bandLimitedSaw(phase, phaseInc);
};
var MASTER_OUTPUT_GAIN = 0.42;
var MASTER_LP_HZ = 11800;
var processMasterSample = (l, r, lpL, lpR, sampleRate2) => {
  let ml = onePoleLP(lpL, l * MASTER_OUTPUT_GAIN, MASTER_LP_HZ, sampleRate2);
  let mr = onePoleLP(lpR, r * MASTER_OUTPUT_GAIN, MASTER_LP_HZ, sampleRate2);
  return { l: softClip(ml), r: softClip(mr) };
};

// src/audio/synth-processor.worklet.ts
var MAX_VOICES = 32;
var SynthProcessor = class extends AudioWorkletProcessor {
  constructor() {
    super();
    __publicField(this, "baseCtxTime", 0);
    __publicField(this, "samplesPlayed", 0);
    __publicField(this, "running", false);
    __publicField(this, "queue", []);
    __publicField(this, "masterLpL", 0);
    __publicField(this, "masterLpR", 0);
    __publicField(this, "voices", Array.from({ length: MAX_VOICES }, () => ({
      active: false,
      pitch: 60,
      velocity: 100,
      waveform: "saw",
      adsr: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.2 },
      pan: 0,
      volume: 1,
      phase: 0,
      noiseSeed: 1,
      lpState: 0,
      hpState: 0,
      envLevel: 0,
      envStage: "off",
      noteOffAt: Infinity,
      voiceStartSec: 0
    })));
    this.port.onmessage = (ev) => {
      const d = ev.data;
      if (d.type === "transport") {
        if (d.action === "start") {
          this.baseCtxTime = d.baseCtxTime;
          this.samplesPlayed = 0;
          this.running = true;
          this.queue = [];
          this.masterLpL = 0;
          this.masterLpR = 0;
          this.killAllVoices();
        } else if (d.action === "stop") {
          this.running = false;
          this.releaseAllVoices();
          this.queue = [];
        }
      } else if (d.type === "schedule") {
        for (const n of d.notes) {
          this.queue.push({ ...n, triggered: false });
        }
      } else if (d.type === "clearQueue") {
        this.queue = [];
      }
    };
  }
  ctxTimeNow() {
    return this.baseCtxTime + this.samplesPlayed / sampleRate;
  }
  killAllVoices() {
    for (const v of this.voices) {
      v.active = false;
      v.envStage = "off";
      v.envLevel = 0;
    }
  }
  releaseAllVoices() {
    const now = this.ctxTimeNow();
    for (const v of this.voices) {
      if (v.active) v.noteOffAt = now;
    }
  }
  allocVoice() {
    let free = this.voices.find((v) => !v.active);
    if (!free) free = this.voices.find((v) => v.envStage === "r" || v.envStage === "s");
    if (!free) free = this.voices[0];
    return free ?? null;
  }
  triggerNote(n) {
    const v = this.allocVoice();
    if (!v) return;
    v.active = true;
    v.pitch = n.pitch;
    v.velocity = n.velocity;
    v.waveform = n.waveform;
    v.adsr = n.adsr;
    v.pan = n.pan;
    v.volume = n.volume;
    v.drumKind = n.drumKind;
    v.phase = 0;
    v.noiseSeed = n.pitch * 7919 + 1 | 1;
    v.lpState = 0;
    v.hpState = 0;
    v.envLevel = 0;
    v.envStage = "a";
    v.noteOffAt = n.noteOffTime;
    v.voiceStartSec = n.ctxTime;
  }
  processEnv(v, dt, now) {
    const { attack, decay, sustain, release } = v.adsr;
    if (now >= v.noteOffAt && v.envStage !== "r" && v.envStage !== "off") {
      v.envStage = "r";
    }
    switch (v.envStage) {
      case "a": {
        v.envLevel += dt / Math.max(1e-3, attack);
        if (v.envLevel >= 1) {
          v.envLevel = 1;
          v.envStage = "d";
        }
        break;
      }
      case "d": {
        v.envLevel -= dt / Math.max(1e-3, decay) * (1 - sustain);
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
        v.envLevel -= dt / Math.max(1e-3, release);
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
  voiceFreq(v, nowSec) {
    if (v.drumKind === "kick") return kickFreqAt(v.voiceStartSec, nowSec);
    if (v.drumKind === "snare") return 190;
    return midiToFreq(v.pitch);
  }
  process(_inputs, outputs) {
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
    const lpL = { v: this.masterLpL };
    const lpR = { v: this.masterLpR };
    for (let i = 0; i < block; i++) {
      const now = this.baseCtxTime + (this.samplesPlayed + i) / sampleRate;
      let l = 0;
      let r = 0;
      for (const v of this.voices) {
        if (!v.active) continue;
        this.processEnv(v, 1 / sampleRate, now);
        if (!v.active) continue;
        const freq = this.voiceFreq(v, now);
        const phaseInc = 2 * Math.PI * freq / sampleRate;
        const noiseSeed = { v: v.noiseSeed };
        const lpState = { v: v.lpState };
        const hpState = { v: v.hpState };
        const raw = oscSampleAdv({
          waveform: v.waveform,
          phase: v.phase,
          phaseInc,
          noiseSeed,
          lpState,
          hpState,
          drumKind: v.drumKind,
          voiceStartSec: v.voiceStartSec,
          nowSec: now,
          sampleRate
        });
        v.noiseSeed = noiseSeed.v;
        v.lpState = lpState.v;
        v.hpState = hpState.v;
        v.phase += phaseInc;
        const amp = raw * v.envLevel * velocityGain(v.velocity) * v.volume;
        const panL = Math.cos((v.pan + 1) * Math.PI / 4);
        const panR = Math.sin((v.pan + 1) * Math.PI / 4);
        l += amp * panL;
        r += amp * panR;
      }
      const out = processMasterSample(l, r, lpL, lpR, sampleRate);
      outL[i] = out.l;
      if (outR) outR[i] = out.r;
    }
    this.masterLpL = lpL.v;
    this.masterLpR = lpR.v;
    this.samplesPlayed += block;
    return true;
  }
};
registerProcessor("dtm-synth", SynthProcessor);
