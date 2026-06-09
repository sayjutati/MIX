/// <reference lib="webworker" />

import { PitchVocoderStream, shiftAtNotes } from "./pitchVocoderCore";
import type { PitchNote } from "../types";

type WorkletMsg =
  | { type: "config"; notes?: PitchNote[]; limit?: number; speed?: number; localTime?: number }
  | { type: "reset"; localTime?: number; speed?: number };

class PitchProcessor extends AudioWorkletProcessor {
  private notes: PitchNote[] = [];
  private limit = 2;
  private speed = 1;
  private bufferPos = 0;
  private vocoders: [PitchVocoderStream | null, PitchVocoderStream | null] = [null, null];

  constructor() {
    super();
    this.port.onmessage = (ev: MessageEvent<WorkletMsg>) => {
      const data = ev.data;
      if (data.type === "config") {
        this.notes = data.notes || [];
        this.limit = data.limit ?? 2;
        if (data.speed != null) this.speed = data.speed;
        if (data.localTime != null) {
          this.bufferPos = data.localTime * this.speed * sampleRate;
        }
      }
      if (data.type === "reset") {
        if (data.speed != null) this.speed = data.speed;
        this.bufferPos = (data.localTime ?? 0) * this.speed * sampleRate;
        for (let c = 0; c < 2; c++) {
          if (this.vocoders[c]) this.vocoders[c]!.reset(this.bufferPos);
        }
      }
    };
  }

  private shiftAt(sec: number) {
    return shiftAtNotes(this.notes, sec, this.limit);
  }

  private getVocoder(ch: number) {
    if (!this.vocoders[ch]) this.vocoders[ch] = new PitchVocoderStream(sampleRate);
    return this.vocoders[ch]!;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.[0] || !output?.[0]) return true;

    const chN = Math.min(2, input.length, output.length);
    const block = input[0].length;
    const startSample = this.bufferPos;

    for (let c = 0; c < chN; c++) {
      const voc = this.getVocoder(c);
      voc.processBlock(
        input[c],
        output[c],
        (t) => this.shiftAt(t),
        startSample,
        this.speed
      );
    }

    this.bufferPos += this.speed * block;
    return true;
  }
}

registerProcessor("pitch-processor", PitchProcessor);

export {};
