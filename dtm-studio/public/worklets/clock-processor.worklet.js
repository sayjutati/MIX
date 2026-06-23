var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/audio/clock-processor.worklet.ts
var ClockProcessor = class extends AudioWorkletProcessor {
  constructor() {
    super();
    __publicField(this, "baseCtxTime", 0);
    __publicField(this, "baseBeat", 0);
    __publicField(this, "tempo", 120);
    __publicField(this, "samplesSinceStart", 0);
    __publicField(this, "running", false);
    __publicField(this, "postEvery", 0);
    __publicField(this, "postCounter", 0);
    this.port.onmessage = (ev) => {
      const d = ev.data;
      if (d.type === "start") {
        this.baseCtxTime = d.baseCtxTime;
        this.baseBeat = d.baseBeat;
        this.tempo = d.tempo;
        this.samplesSinceStart = 0;
        this.running = true;
        this.postEvery = Math.max(128, Math.floor(sampleRate / 30));
        this.postCounter = 0;
      } else if (d.type === "stop") {
        this.running = false;
      } else if (d.type === "seek") {
        this.baseCtxTime = d.ctxTime;
        this.baseBeat = d.beat;
        this.tempo = d.tempo;
        this.samplesSinceStart = 0;
        this.running = true;
      }
    };
  }
  beatNow() {
    const sec = this.samplesSinceStart / sampleRate;
    return this.baseBeat + sec * this.tempo / 60;
  }
  ctxTimeNow() {
    return this.baseCtxTime + this.samplesSinceStart / sampleRate;
  }
  process(_inputs, outputs) {
    const block = outputs[0]?.[0]?.length ?? 128;
    if (this.running) {
      this.samplesSinceStart += block;
      this.postCounter += block;
      if (this.postCounter >= this.postEvery) {
        this.postCounter = 0;
        this.port.postMessage({
          type: "position",
          beat: this.beatNow(),
          ctxTime: this.ctxTimeNow()
        });
      }
    }
    for (const ch of outputs[0] ?? []) ch.fill(0);
    return true;
  }
};
registerProcessor("dtm-clock", ClockProcessor);
