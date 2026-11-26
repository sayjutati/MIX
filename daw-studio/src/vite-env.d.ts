/// <reference types="vite/client" />

declare module "lamejs/lame.min.js?raw" {
  const src: string;
  export default src;
}

declare module "*?url" {
  const url: string;
  export default url;
}

/** AudioWorklet プロセッサ用グローバル */
declare abstract class AudioWorkletProcessor {
  constructor(options?: AudioWorkletNodeOptions);
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
  readonly port: MessagePort;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor
): void;

declare const sampleRate: number;
