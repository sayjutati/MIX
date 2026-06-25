import type { PluginSlot, TrackFx } from "../types/project";

export type TrackFxNodes = {
  input: GainNode;
  eqLow: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  compMakeup: GainNode;
  delay: DelayNode;
  delayGain: GainNode;
  dryGain: GainNode;
  reverb: ConvolverNode;
  reverbGain: GainNode;
  panner: StereoPannerNode;
  out: GainNode;
  pluginNodes: AudioWorkletNode[];
};

const createReverbIR = (ctx: BaseAudioContext) => {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * 1.8);
  const impulse = ctx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.5);
    }
  }
  return impulse;
};

export const createTrackFxChain = (
  ctx: AudioContext,
  destination: AudioNode
): TrackFxNodes => {
  const input = ctx.createGain();
  const eqLow = ctx.createBiquadFilter();
  eqLow.type = "lowshelf";
  eqLow.frequency.value = 320;
  const eqHigh = ctx.createBiquadFilter();
  eqHigh.type = "highshelf";
  eqHigh.frequency.value = 3200;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.ratio.value = 4;
  const compMakeup = ctx.createGain();
  const delay = ctx.createDelay(2);
  const delayGain = ctx.createGain();
  delayGain.gain.value = 0;
  delay.connect(delayGain);
  delayGain.connect(delay);
  const dryGain = ctx.createGain();
  const reverb = ctx.createConvolver();
  reverb.buffer = createReverbIR(ctx);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0;
  const panner = ctx.createStereoPanner();
  const out = ctx.createGain();

  input.connect(eqLow);
  eqLow.connect(eqHigh);
  eqHigh.connect(comp);
  comp.connect(compMakeup);
  compMakeup.connect(dryGain);
  compMakeup.connect(delay);
  compMakeup.connect(reverb);
  reverb.connect(reverbGain);
  dryGain.connect(panner);
  delayGain.connect(panner);
  reverbGain.connect(panner);
  panner.connect(out);
  out.connect(destination);

  return {
    input,
    eqLow,
    eqHigh,
    comp,
    compMakeup,
    delay,
    delayGain,
    dryGain,
    reverb,
    reverbGain,
    panner,
    out,
    pluginNodes: [],
  };
};

export const applyTrackFx = (nodes: TrackFxNodes, fx: TrackFx, pan: number, volume: number) => {
  nodes.eqLow.gain.value = fx.eqLow * 12;
  nodes.eqHigh.gain.value = fx.eqHigh * 12;
  nodes.comp.threshold.value = -24 - fx.compressor * 18;
  nodes.compMakeup.gain.value = 1 + fx.compressor * 0.5;
  nodes.delay.delayTime.value = Math.max(0.05, fx.delayTime);
  nodes.delayGain.gain.value = fx.delay * 0.45;
  nodes.dryGain.gain.value = 1;
  nodes.reverbGain.gain.value = fx.reverb * 0.55;
  nodes.panner.pan.value = pan;
  nodes.out.gain.value = volume;
};

export const BUILTIN_PLUGINS = [
  { id: "builtin:reverb", name: "リバーブ" },
  { id: "builtin:delay", name: "ディレイ" },
  { id: "builtin:eq", name: "EQ" },
  { id: "builtin:compressor", name: "コンプ" },
] as const;

export type ExternalPluginInfo = {
  workletUrl: string;
  processorName: string;
  name: string;
};

const loadedModules = new Set<string>();

export async function loadExternalWorklet(ctx: AudioContext, workletUrl: string): Promise<void> {
  if (loadedModules.has(workletUrl)) return;
  await ctx.audioWorklet.addModule(workletUrl);
  loadedModules.add(workletUrl);
}

export async function createPluginNode(
  ctx: AudioContext,
  slot: PluginSlot,
  input: AudioNode,
  output: AudioNode
): Promise<AudioWorkletNode | null> {
  if (!slot.enabled || slot.pluginId !== "external") return null;
  if (!slot.workletUrl || !slot.processorName) return null;
  try {
    await loadExternalWorklet(ctx, slot.workletUrl);
    const node = new AudioWorkletNode(ctx, slot.processorName, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    input.connect(node);
    node.connect(output);
    return node;
  } catch (e) {
    console.warn("External plugin load failed:", slot.name, e);
    return null;
  }
}

export const makeExternalPluginSlot = (info: ExternalPluginInfo): PluginSlot => ({
  id: `pl-${Date.now()}`,
  name: info.name,
  enabled: true,
  pluginId: "external",
  workletUrl: info.workletUrl,
  processorName: info.processorName,
  params: {},
});
