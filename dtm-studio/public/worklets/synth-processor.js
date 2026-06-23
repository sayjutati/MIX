var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/audio/synth-processor.worklet.ts
var MAX_VOICES = 32;
var oscSample = (wf, phase) => {
  const t = phase % (2 * Math.PI);
  if (wf === "sine") return Math.sin(t);
  if (wf === "square") return t < Math.PI ? 1 : -1;
  return 2 * (t / (2 * Math.PI)) - 1;
};
var SynthProcessor = class extends AudioWorkletProcessor {
  constructor() {
    super();
    __publicField(this, "baseCtxTime", 0);
    __publicField(this, "samplesPlayed", 0);
    __publicField(this, "running", false);
    __publicField(this, "queue", []);
    __publicField(this, "voices", Array.from({ length: MAX_VOICES }, () => ({
      active: false,
      pitch: 60,
      velocity: 100,
      waveform: "saw",
      adsr: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.2 },
      pan: 0,
      volume: 1,
      phase: 0,
      envLevel: 0,
      envStage: "off",
      noteOffAt: Infinity
    })));
    this.port.onmessage = (ev) => {
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
    v.phase = 0;
    v.envLevel = 0;
    v.envStage = "a";
    v.noteOffAt = n.noteOffTime;
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
    for (let i = 0; i < block; i++) {
      const now = this.baseCtxTime + (this.samplesPlayed + i) / sampleRate;
      let l = 0;
      let r = 0;
      for (const v of this.voices) {
        if (!v.active) continue;
        this.processEnv(v, 1 / sampleRate, now);
        if (!v.active) continue;
        const freq = 440 * Math.pow(2, (v.pitch - 69) / 12);
        v.phase += 2 * Math.PI * freq / sampleRate;
        const amp = oscSample(v.waveform, v.phase) * v.envLevel * (v.velocity / 127) * v.volume;
        const panL = Math.cos((v.pan + 1) * Math.PI / 4);
        const panR = Math.sin((v.pan + 1) * Math.PI / 4);
        l += amp * panL;
        r += amp * panR;
      }
      outL[i] = l;
      if (outR) outR[i] = r;
    }
    this.samplesPlayed += block;
    return true;
  }
};
registerProcessor("dtm-synth", SynthProcessor);
