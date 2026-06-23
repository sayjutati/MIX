/// <reference lib="webworker" />

export type ClockMsg =
  | { type: "start"; baseCtxTime: number; baseBeat: number; tempo: number }
  | { type: "stop" }
  | { type: "seek"; beat: number; ctxTime: number; tempo: number };

class ClockProcessor extends AudioWorkletProcessor {
  private baseCtxTime = 0;
  private baseBeat = 0;
  private tempo = 120;
  private samplesSinceStart = 0;
  private running = false;
  private postEvery = 0;
  private postCounter = 0;

  constructor() {
    super();
    this.port.onmessage = (ev: MessageEvent<ClockMsg>) => {
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

  private beatNow() {
    const sec = this.samplesSinceStart / sampleRate;
    return this.baseBeat + (sec * this.tempo) / 60;
  }

  private ctxTimeNow() {
    return this.baseCtxTime + this.samplesSinceStart / sampleRate;
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const block = outputs[0]?.[0]?.length ?? 128;
    if (this.running) {
      this.samplesSinceStart += block;
      this.postCounter += block;
      if (this.postCounter >= this.postEvery) {
        this.postCounter = 0;
        this.port.postMessage({
          type: "position",
          beat: this.beatNow(),
          ctxTime: this.ctxTimeNow(),
        });
      }
    }
    for (const ch of outputs[0] ?? []) ch.fill(0);
    return true;
  }
}

registerProcessor("dtm-clock", ClockProcessor);
export {};
