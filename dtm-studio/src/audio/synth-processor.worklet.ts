/// <reference lib="webworker" />

import { processMasterSample, type DrumKind, type OscWaveform } from "./oscCore";
import {
  createVoice,
  MAX_VOICES,
  processVoiceEnv,
  triggerVoice,
  voiceSample,
  type NoteEvent,
  type VoiceState,
} from "./synthCore";
import type { VoicePatch } from "./voicePatch";
import { setSample } from "./sampleBank";

type Adsr = { attack: number; decay: number; sustain: number; release: number };

type ScheduledNote = {
  ctxTime: number;
  pitch: number;
  velocity: number;
  durationSec: number;
  waveform: OscWaveform;
  adsr: Adsr;
  pan: number;
  volume: number;
  noteOffTime: number;
  drumKind?: DrumKind;
  patch?: VoicePatch;
  sampleId?: string;
  triggered: boolean;
};

class SynthProcessor extends AudioWorkletProcessor {
  private baseCtxTime = 0;
  private samplesPlayed = 0;
  private running = false;
  private queue: ScheduledNote[] = [];
  private masterLpL = 0;
  private masterLpR = 0;
  private voices: VoiceState[] = Array.from({ length: MAX_VOICES }, createVoice);

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
          this.masterLpL = 0;
          this.masterLpR = 0;
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
      } else if (d.type === "sample") {
        setSample(d.id, {
          data: d.data,
          sampleRate: d.sampleRate,
          rootHz: d.rootHz,
          loopStart: d.loopStart,
          loopEnd: d.loopEnd,
        });
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

  private triggerNote(n: ScheduledNote) {
    let free = this.voices.find((v) => !v.active);
    if (!free) free = this.voices.find((v) => v.envStage === "r" || v.envStage === "s");
    if (!free) free = this.voices[0];
    if (!free) return;
    const ev: NoteEvent = {
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
      sampleId: n.sampleId,
    };
    triggerVoice(free, ev);
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
}

registerProcessor("dtm-synth", SynthProcessor);
export {};
