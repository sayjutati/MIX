import type { Track } from "../types";
import { trackEffectiveOffset } from "../types";

export type TrackEffectNodes = {
  input: GainNode;
  fadeGain: GainNode;
  outGain: GainNode;
  panner: StereoPannerNode;
  eqBass: BiquadFilterNode;
  eqTreble: BiquadFilterNode;
  noiseFilter: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  tremoloNode: GainNode;
  tremoloDepth: GainNode;
  chorusGain: GainNode;
  delayGain: GainNode;
  reverbGain: GainNode;
  /** エフェクトオフ時のバイパス */
  dryGain: GainNode;
  wetBus: GainNode;
};

const EPS = 0.001;

export const computeFadeGain = (
  track: Track,
  localTime: number,
  duration: number
): number => {
  if (duration <= 0) return 1;
  let gain = 1;
  if (track.fadeIn > 0 && localTime < track.fadeIn) {
    gain = Math.max(0, localTime / track.fadeIn);
  }
  if (track.fadeOut > 0 && localTime > duration - track.fadeOut) {
    const tail = Math.max(0, (duration - localTime) / track.fadeOut);
    gain = Math.min(gain, tail);
  }
  return gain;
};

export const applyTremoloModulation = (
  ctx: BaseAudioContext,
  depth: GainNode,
  node: GainNode,
  amount: number
) => {
  depth.disconnect();
  node.gain.cancelScheduledValues(ctx.currentTime);
  if (amount > EPS) {
    depth.gain.value = amount;
    depth.connect(node.gain);
  } else {
    node.gain.value = 1;
  }
};

export const createBetterReverbIR = (ctx: BaseAudioContext) => {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * 2;
  const impulse = ctx.createBuffer(2, length, sampleRate);
  for (let i = 0; i < length; i++) {
    const decay = Math.pow(1 - i / length, 3);
    impulse.getChannelData(0)[i] = (Math.random() * 2 - 1) * decay;
    impulse.getChannelData(1)[i] = (Math.random() * 2 - 1) * decay;
  }
  return impulse;
};

/**
 * 高品質再生用チェーン。
 * デフォルトは EQ → Pan → Out のクリーン経路。エフェクトは wet バスにのみ送る。
 */
export const createTrackEffectChain = (
  ctx: AudioContext,
  destination: AudioNode,
  track: Track
): TrackEffectNodes => {
  const input = ctx.createGain();

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "highpass";
  noiseFilter.frequency.value = 20;
  noiseFilter.Q.value = 0.7;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = 0;
  comp.ratio.value = 1;
  comp.knee.value = 0;
  comp.attack.value = 0.003;
  comp.release.value = 0.05;

  const eqBass = ctx.createBiquadFilter();
  eqBass.type = "lowshelf";
  eqBass.frequency.value = 250;
  eqBass.gain.value = 0;

  const eqTreble = ctx.createBiquadFilter();
  eqTreble.type = "highshelf";
  eqTreble.frequency.value = 4000;
  eqTreble.gain.value = 0;

  const tremoloOsc = ctx.createOscillator();
  tremoloOsc.frequency.value = 5;
  const tremoloDepth = ctx.createGain();
  tremoloDepth.gain.value = 0;
  const tremoloNode = ctx.createGain();
  tremoloNode.gain.value = 1;
  tremoloOsc.connect(tremoloDepth);
  tremoloOsc.start();

  const panner = ctx.createStereoPanner();
  const fadeGain = ctx.createGain();
  fadeGain.gain.value = 1;
  const outGain = ctx.createGain();
  outGain.gain.value = track.volume;

  const dryGain = ctx.createGain();
  dryGain.gain.value = 1;
  const wetBus = ctx.createGain();
  wetBus.gain.value = 1;

  const chorusDelay = ctx.createDelay(0.1);
  chorusDelay.delayTime.value = 0.025;
  const chorusGain = ctx.createGain();
  chorusGain.gain.value = 0;

  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.35;
  const delayFeedback = ctx.createGain();
  delayFeedback.gain.value = 0.28;
  const delayGain = ctx.createGain();
  delayGain.gain.value = 0;

  const convolver = ctx.createConvolver();
  convolver.buffer = createBetterReverbIR(ctx);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0;

  // クリーン経路: input → [HP?] → [comp?] → EQ → tremolo → pan → dry → fade → out
  input.connect(noiseFilter);
  noiseFilter.connect(comp);
  comp.connect(eqBass);
  eqBass.connect(eqTreble);
  eqTreble.connect(tremoloNode);
  tremoloNode.connect(panner);
  panner.connect(dryGain);
  dryGain.connect(fadeGain);

  // Wet 経路（エフェクト0なら無音）
  panner.connect(chorusDelay);
  chorusDelay.connect(chorusGain);
  chorusGain.connect(wetBus);

  panner.connect(delay);
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);
  delay.connect(delayGain);
  delayGain.connect(wetBus);

  panner.connect(convolver);
  convolver.connect(reverbGain);
  reverbGain.connect(wetBus);

  wetBus.connect(fadeGain);
  fadeGain.connect(outGain);
  outGain.connect(destination);

  const nodes: TrackEffectNodes = {
    input,
    fadeGain,
    outGain,
    panner,
    eqBass,
    eqTreble,
    noiseFilter,
    comp,
    tremoloNode,
    tremoloDepth,
    chorusGain,
    delayGain,
    reverbGain,
    dryGain,
    wetBus,
  };

  applyTrackEffectParams(ctx, nodes, track);
  return nodes;
};

export const applyTrackEffectParams = (
  ctx: BaseAudioContext,
  nodes: TrackEffectNodes,
  track: Track
) => {
  nodes.eqBass.gain.value = track.bass;
  nodes.eqTreble.gain.value = track.treble;
  nodes.panner.pan.value = track.pan;
  nodes.outGain.gain.value = track.volume;
  nodes.chorusGain.gain.value = track.chorus;
  nodes.delayGain.gain.value = track.delay;
  nodes.reverbGain.gain.value = track.reverb;

  if (track.noiseReduce > EPS) {
    nodes.noiseFilter.frequency.value = 80 + track.noiseReduce * 420;
  } else {
    nodes.noiseFilter.frequency.value = 20;
  }

  if (track.compressor > EPS) {
    nodes.comp.threshold.value = track.compressor * -50;
    nodes.comp.ratio.value = 1 + track.compressor * 19;
    nodes.comp.knee.value = 6;
  } else {
    nodes.comp.threshold.value = 0;
    nodes.comp.ratio.value = 1;
    nodes.comp.knee.value = 0;
  }

  applyTremoloModulation(ctx, nodes.tremoloDepth, nodes.tremoloNode, track.tremolo);
};

export const setTrackOutputVolume = (nodes: TrackEffectNodes, volume: number) => {
  nodes.outGain.gain.value = volume;
};

export const applyLiveFade = (
  fadeGain: GainNode | null,
  track: Track,
  globalTime: number
) => {
  if (!fadeGain) return;
  const duration = track.duration;
  if (duration <= 0) return;
  const localTime = globalTime - trackEffectiveOffset(track);
  fadeGain.gain.value = computeFadeGain(track, localTime, duration);
};

/** オフライン書き出し用（OfflineAudioContext） */
export const connectOfflineTrackChain = (
  ctx: OfflineAudioContext,
  input: AudioNode,
  track: Track,
  destination: AudioNode
): { fadeGain: GainNode } => {
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "highpass";
  noiseFilter.frequency.value = track.noiseReduce > EPS ? 80 + track.noiseReduce * 420 : 20;

  const comp = ctx.createDynamicsCompressor();
  if (track.compressor > EPS) {
    comp.threshold.value = track.compressor * -50;
    comp.ratio.value = 1 + track.compressor * 19;
  } else {
    comp.threshold.value = 0;
    comp.ratio.value = 1;
  }

  const eqBass = ctx.createBiquadFilter();
  eqBass.type = "lowshelf";
  eqBass.frequency.value = 250;
  eqBass.gain.value = track.bass;

  const eqTreble = ctx.createBiquadFilter();
  eqTreble.type = "highshelf";
  eqTreble.frequency.value = 4000;
  eqTreble.gain.value = track.treble;

  const panner = ctx.createStereoPanner();
  panner.pan.value = track.pan;

  const fadeGain = ctx.createGain();
  const outGain = ctx.createGain();
  outGain.gain.value = track.volume;

  const chorusDelay = ctx.createDelay(0.1);
  chorusDelay.delayTime.value = 0.025;
  const chorusGain = ctx.createGain();
  chorusGain.gain.value = track.chorus;

  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.35;
  const fb = ctx.createGain();
  fb.gain.value = 0.28;
  const delayGain = ctx.createGain();
  delayGain.gain.value = track.delay;

  const convolver = ctx.createConvolver();
  convolver.buffer = createBetterReverbIR(ctx);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = track.reverb;

  input.connect(noiseFilter);
  noiseFilter.connect(comp);
  comp.connect(eqBass);
  eqBass.connect(eqTreble);
  eqTreble.connect(panner);

  panner.connect(fadeGain);
  panner.connect(chorusDelay);
  chorusDelay.connect(chorusGain);
  chorusGain.connect(fadeGain);
  panner.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(delayGain);
  delayGain.connect(fadeGain);
  panner.connect(convolver);
  convolver.connect(reverbGain);
  reverbGain.connect(fadeGain);

  fadeGain.connect(outGain);
  outGain.connect(destination);

  return { fadeGain };
};
