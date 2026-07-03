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
var triangleWave = (phase) => {
  const t = phase % TAU / TAU;
  return 4 * Math.abs(t - 0.5) - 1;
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
var svfLowpass = (state, input, cutoffHz, damp, sampleRate2) => {
  const f = 2 * Math.sin(Math.PI * Math.min(0.22, cutoffHz / sampleRate2));
  state.low += f * state.band;
  const high = input - state.low - damp * state.band;
  state.band += f * high;
  if (!Number.isFinite(state.low) || Math.abs(state.low) > 4) {
    state.low = 0;
    state.band = 0;
  }
  return state.low;
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
  if (drumKind === "hat" || drumKind === "openhat") {
    const raw = nextNoise(noiseSeed);
    const hp = hpState ?? { v: 0 };
    const filtered = onePoleHP(hp, raw, drumKind === "openhat" ? 6200 : 6800, sampleRate2);
    if (hpState) hpState.v = hp.v;
    return filtered * 0.85;
  }
  if (drumKind === "clap") {
    const t = Math.max(0, nowSec - voiceStartSec);
    const raw = nextNoise(noiseSeed);
    const hp = hpState ?? { v: 0 };
    const highpassed = onePoleHP(hp, raw, 900, sampleRate2);
    if (hpState) hpState.v = hp.v;
    const lp = lpState ?? { v: 0 };
    const filtered = onePoleLP(lp, highpassed, 3800, sampleRate2);
    if (lpState) lpState.v = lp.v;
    const burst = t < 0.033 ? Math.exp(-(t * 1e3 % 11) / 3.2) : Math.exp(-(t - 0.033) / 0.09) * 0.7;
    return filtered * burst * 2.2;
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
  if (waveform === "triangle") return triangleWave(phase);
  if (waveform === "square") return bandLimitedSquare(phase, phaseInc);
  return bandLimitedSaw(phase, phaseInc);
};
var MASTER_OUTPUT_GAIN = 0.42;
var MASTER_LP_HZ = 16e3;
var processMasterSample = (l, r, lpL, lpR, sampleRate2) => {
  let ml = onePoleLP(lpL, l * MASTER_OUTPUT_GAIN, MASTER_LP_HZ, sampleRate2);
  let mr = onePoleLP(lpR, r * MASTER_OUTPUT_GAIN, MASTER_LP_HZ, sampleRate2);
  return { l: softClip(ml), r: softClip(mr) };
};

// src/audio/sampleBank.ts
var bank = /* @__PURE__ */ new Map();
var setSample = (id, sample) => {
  bank.set(id, sample);
};
var getSample = (id) => bank.get(id);
var readSampleLinear = (s, pos) => {
  if (pos < 0 || pos >= s.data.length - 1) return 0;
  const i = Math.floor(pos);
  const frac = pos - i;
  return s.data[i] * (1 - frac) + s.data[i + 1] * frac;
};

// src/audio/synthCore.ts
var MAX_OSC_LAYERS = 3;
var TAU2 = 2 * Math.PI;
var createVoice = () => ({
  active: false,
  pitch: 60,
  velocity: 100,
  waveform: "saw",
  adsr: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.2 },
  pan: 0,
  volume: 1,
  phase: 0,
  oscPhases: new Array(MAX_OSC_LAYERS).fill(0),
  svf: { low: 0, band: 0 },
  noiseSeed: 1,
  lpState: 0,
  hpState: 0,
  envLevel: 0,
  envStage: "off",
  noteOffAt: Infinity,
  voiceStartSec: 0,
  samplePos: 0
});
var triggerVoice = (v, ev) => {
  v.active = true;
  v.pitch = ev.pitch;
  v.velocity = ev.velocity;
  v.waveform = ev.waveform;
  v.adsr = ev.adsr;
  v.pan = ev.pan;
  v.volume = ev.volume;
  v.drumKind = ev.drumKind;
  v.patch = ev.patch;
  v.sampleId = ev.sampleId;
  v.samplePos = 0;
  v.phase = 0;
  for (let i = 0; i < MAX_OSC_LAYERS; i++) v.oscPhases[i] = i * 1.9;
  v.svf.low = 0;
  v.svf.band = 0;
  v.noiseSeed = ev.pitch * 7919 + Math.floor(ev.startSec * 1e3) | 1;
  v.lpState = 0;
  v.hpState = 0;
  v.envLevel = 0;
  v.envStage = "a";
  v.noteOffAt = ev.endSec;
  v.voiceStartSec = ev.startSec;
};
var processVoiceEnv = (v, dt, now) => {
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
};
var patchSample = (v, patch, sampleRate2, nowSec) => {
  const t = Math.max(0, nowSec - v.voiceStartSec);
  let semis = 0;
  if (patch.pitchEnv) {
    semis += patch.pitchEnv.semitones * Math.exp(-t / Math.max(5e-3, patch.pitchEnv.decaySec));
  }
  if (patch.vibrato) {
    const fade = Math.min(1, Math.max(0, (t - patch.vibrato.delaySec) / 0.3));
    semis += Math.sin(TAU2 * patch.vibrato.rateHz * t) * (patch.vibrato.cents / 100) * fade;
  }
  let sum = 0;
  const n = Math.min(patch.oscs.length, MAX_OSC_LAYERS);
  for (let i = 0; i < n; i++) {
    const layer = patch.oscs[i];
    const pitch = v.pitch + semis + layer.octave * 12 + layer.detuneCents / 100;
    const freq = midiToFreq(pitch);
    const phaseInc = TAU2 * freq / sampleRate2;
    const noiseSeed = { v: v.noiseSeed };
    const raw = oscSampleAdv({
      waveform: layer.waveform,
      phase: v.oscPhases[i],
      phaseInc,
      noiseSeed,
      sampleRate: sampleRate2
    });
    v.noiseSeed = noiseSeed.v;
    v.oscPhases[i] = v.oscPhases[i] + phaseInc;
    sum += raw * layer.level;
  }
  if (patch.noiseLevel) {
    const seed = { v: v.noiseSeed };
    sum += nextNoise(seed) * patch.noiseLevel;
    v.noiseSeed = seed.v;
  }
  if (patch.filter) {
    const f = patch.filter;
    const env = f.envOctaves * Math.exp(-t / Math.max(5e-3, f.envDecaySec));
    const keyTrack = f.keyTrack ? Math.pow(2, (v.pitch - 60) / 12 * f.keyTrack) : 1;
    const cutoff = Math.min(sampleRate2 * 0.22, Math.max(40, f.cutoffHz * Math.pow(2, env) * keyTrack));
    sum = svfLowpass(v.svf, sum, cutoff, f.damp, sampleRate2);
  }
  return sum;
};
var samplerSample = (v, s, sampleRate2) => {
  const rate = midiToFreq(v.pitch) / s.rootHz * (s.sampleRate / sampleRate2);
  if (s.loopEnd > s.loopStart) {
    const loopLen = s.loopEnd - s.loopStart;
    while (v.samplePos >= s.loopEnd) v.samplePos -= loopLen;
  } else if (v.samplePos >= s.data.length - 1) {
    return 0;
  }
  const out = readSampleLinear(s, v.samplePos);
  v.samplePos += rate;
  return out;
};
var voiceSample = (v, sampleRate2, nowSec) => {
  if (!v.active) return { l: 0, r: 0 };
  let raw;
  const sample = v.sampleId ? getSample(v.sampleId) : void 0;
  if (sample) {
    raw = samplerSample(v, sample, sampleRate2);
  } else if (!v.drumKind && v.patch) {
    raw = patchSample(v, v.patch, sampleRate2, nowSec);
  } else {
    let freq = midiToFreq(v.pitch);
    if (v.drumKind === "kick") freq = kickFreqAt(v.voiceStartSec, nowSec);
    else if (v.drumKind === "snare") freq = 190;
    const phaseInc = TAU2 * freq / sampleRate2;
    const noiseSeed = { v: v.noiseSeed };
    const lpState = { v: v.lpState };
    const hpState = { v: v.hpState };
    raw = oscSampleAdv({
      waveform: v.waveform,
      phase: v.phase,
      phaseInc,
      noiseSeed,
      lpState,
      hpState,
      drumKind: v.drumKind,
      voiceStartSec: v.voiceStartSec,
      nowSec,
      sampleRate: sampleRate2
    });
    v.noiseSeed = noiseSeed.v;
    v.lpState = lpState.v;
    v.hpState = hpState.v;
    v.phase += phaseInc;
  }
  const amp = raw * v.envLevel * velocityGain(v.velocity) * v.volume;
  const panL = Math.cos((v.pan + 1) * Math.PI / 4);
  const panR = Math.sin((v.pan + 1) * Math.PI / 4);
  return { l: amp * panL, r: amp * panR };
};
var MAX_VOICES = 32;

// src/audio/synth-processor.worklet.ts
var SynthProcessor = class extends AudioWorkletProcessor {
  constructor() {
    super();
    __publicField(this, "baseCtxTime", 0);
    __publicField(this, "samplesPlayed", 0);
    __publicField(this, "running", false);
    __publicField(this, "queue", []);
    __publicField(this, "masterLpL", 0);
    __publicField(this, "masterLpR", 0);
    __publicField(this, "voices", Array.from({ length: MAX_VOICES }, createVoice));
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
      } else if (d.type === "sample") {
        setSample(d.id, {
          data: d.data,
          sampleRate: d.sampleRate,
          rootHz: d.rootHz,
          loopStart: d.loopStart,
          loopEnd: d.loopEnd
        });
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
  triggerNote(n) {
    let free = this.voices.find((v) => !v.active);
    if (!free) free = this.voices.find((v) => v.envStage === "r" || v.envStage === "s");
    if (!free) free = this.voices[0];
    if (!free) return;
    const ev = {
      startSec: n.ctxTime,
      endSec: n.noteOffTime,
      pitch: n.pitch,
      velocity: n.velocity,
      waveform: n.waveform,
      adsr: n.adsr,
      pan: n.pan,
      volume: n.volume,
      drumKind: n.drumKind,
      patch: n.patch,
      sampleId: n.sampleId
    };
    triggerVoice(free, ev);
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
        processVoiceEnv(v, 1 / sampleRate, now);
        if (!v.active) continue;
        const s = voiceSample(v, sampleRate, now);
        l += s.l;
        r += s.r;
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
