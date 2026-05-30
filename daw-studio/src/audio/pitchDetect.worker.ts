import { detectNotesFromMono } from "./pitch";

export type PitchDetectResult = { notes: ReturnType<typeof detectNotesFromMono> };
export type PitchDetectRequest = { mono: Float32Array; sampleRate: number };

self.onmessage = (e: MessageEvent<PitchDetectRequest>) => {
  const { mono, sampleRate } = e.data;
  const notes = detectNotesFromMono(mono, sampleRate);
  self.postMessage({ notes } satisfies PitchDetectResult);
};

export {};
