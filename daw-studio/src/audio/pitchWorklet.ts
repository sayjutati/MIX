import type { PitchNote } from "../types";

const WORKLET_URL = `${import.meta.env.BASE_URL}worklets/pitch-processor.js`;

let loadedCtx: AudioContext | null = null;
let loadPromise: Promise<void> | null = null;

export function preloadPitchWorklet(ctx: AudioContext): Promise<void> {
  return ensurePitchWorklet(ctx);
}

export async function ensurePitchWorklet(ctx: AudioContext): Promise<void> {
  if (loadedCtx === ctx) return;
  if (!loadPromise) {
    loadPromise = ctx.audioWorklet.addModule(WORKLET_URL).then(() => {
      loadedCtx = ctx;
    });
  }
  await loadPromise;
}

export function createPitchNode(ctx: AudioContext): AudioWorkletNode {
  return new AudioWorkletNode(ctx, "pitch-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
}

export type PitchWorkletConfig = {
  notes: PitchNote[];
  limit: number;
  speed: number;
  /** 省略時は vocoder のタイムラインを維持（編集中の連続再生用） */
  localTime?: number;
};

export function sendPitchConfig(node: AudioWorkletNode, cfg: PitchWorkletConfig) {
  node.port.postMessage({ type: "config", ...cfg });
}

export function resetPitchNode(
  node: AudioWorkletNode,
  localTime: number,
  speed: number
) {
  node.port.postMessage({ type: "reset", localTime, speed });
}

export const notesNeedWorklet = (notes?: PitchNote[]) =>
  !!notes?.some((n) => Math.round(n.shift) !== 0);
