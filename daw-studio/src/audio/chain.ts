import type { Track } from "../types";

export type TrackEffectNodes = {
  input: GainNode;
  fadeGain: GainNode;
  outGain: GainNode;
  panner: StereoPannerNode;
  eqBass: BiquadFilterNode;
  eqTreble: BiquadFilterNode;
  noiseFilter: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  /** コンプ後のメイクアップゲイン（圧縮で下がった音量を持ち上げる） */
  compMakeup: GainNode;
  /** ディエッサー：高域側コンプ */
  deEssComp: DynamicsCompressorNode;
  /** ディエッサーのクロスオーバー（0時は完全バイパスして色付けを防ぐ） */
  deEssLow1: BiquadFilterNode;
  deEssHigh1: BiquadFilterNode;
  deEssSum: GainNode;
  deEssActive: boolean;
  tremoloNode: GainNode;
  tremoloDepth: GainNode;
  chorusGain: GainNode;
  delayGain: GainNode;
  reverbGain: GainNode;
  /** エフェクトオフ時のバイパス */
  dryGain: GainNode;
  wetBus: GainNode;
};

/** コンプ量(0〜1)に対するメイクアップゲイン（倍率） */
const makeupGainFor = (compressor: number) => {
  if (compressor <= EPS) return 1;
  // しきい値を下げるほど音量が落ちるので、その分を概算で補償
  return Math.pow(10, (compressor * 9) / 20);
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

/**
 * 改良リバーブIR：プリディレイ＋指数減衰＋ダンピング（高域を時間とともに減衰）＋
 * 左右デコリレーションで、金属的にならない自然な響きにする。
 */
export const createBetterReverbIR = (ctx: BaseAudioContext) => {
  const sampleRate = ctx.sampleRate;
  const seconds = 2.4;
  const length = Math.floor(sampleRate * seconds);
  const preDelay = Math.floor(sampleRate * 0.02); // 20ms
  const impulse = ctx.createBuffer(2, length, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    // 1次ローパスの状態（ダンピング用）。チャンネルでわずかに係数を変えてステレオ感を出す
    let lp = 0;
    const baseCoef = ch === 0 ? 0.34 : 0.38;
    for (let i = 0; i < length; i++) {
      if (i < preDelay) {
        data[i] = 0;
        continue;
      }
      const t = (i - preDelay) / (length - preDelay);
      const decay = Math.pow(1 - t, 2.6); // 指数的減衰
      // 時間が進むほどローパスを強くして高域を削る（ダンピング）
      const coef = baseCoef + t * 0.5;
      const white = Math.random() * 2 - 1;
      lp = lp + (white - lp) * (1 - coef);
      data[i] = lp * decay;
    }
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

  const compMakeup = ctx.createGain();
  compMakeup.gain.value = 1;

  // ディエッサー（Linkwitz-Riley 風 4次クロスオーバー：オフ時は和がフラット）
  const deEssFreq = 6500;
  const deEssLow1 = ctx.createBiquadFilter();
  const deEssLow2 = ctx.createBiquadFilter();
  const deEssHigh1 = ctx.createBiquadFilter();
  const deEssHigh2 = ctx.createBiquadFilter();
  for (const f of [deEssLow1, deEssLow2]) {
    f.type = "lowpass";
    f.frequency.value = deEssFreq;
    f.Q.value = 0.7071;
  }
  for (const f of [deEssHigh1, deEssHigh2]) {
    f.type = "highpass";
    f.frequency.value = deEssFreq;
    f.Q.value = 0.7071;
  }
  const deEssComp = ctx.createDynamicsCompressor();
  deEssComp.threshold.value = 0;
  deEssComp.ratio.value = 1;
  deEssComp.knee.value = 0;
  deEssComp.attack.value = 0.001;
  deEssComp.release.value = 0.05;
  const deEssSum = ctx.createGain();

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

  // 本物のコーラス：LFO で遅延時間を揺らして音程を微妙に変調
  const chorusDelay = ctx.createDelay(0.1);
  chorusDelay.delayTime.value = 0.025;
  const chorusLfo = ctx.createOscillator();
  chorusLfo.frequency.value = 0.8;
  const chorusLfoDepth = ctx.createGain();
  chorusLfoDepth.gain.value = 0.004; // ±4ms
  chorusLfo.connect(chorusLfoDepth);
  chorusLfoDepth.connect(chorusDelay.delayTime);
  chorusLfo.start();
  const chorusGain = ctx.createGain();
  chorusGain.gain.value = 0;

  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.35;
  const delayFeedback = ctx.createGain();
  delayFeedback.gain.value = 0.28;
  // フィードバックの高域を削って自然な減衰に
  const delayDamp = ctx.createBiquadFilter();
  delayDamp.type = "lowpass";
  delayDamp.frequency.value = 3200;
  const delayGain = ctx.createGain();
  delayGain.gain.value = 0;

  const convolver = ctx.createConvolver();
  convolver.buffer = createBetterReverbIR(ctx);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0;

  // クリーン経路: input → HP → comp → makeup → EQ → de-ess → tremolo → pan → dry → fade → out
  input.connect(noiseFilter);
  noiseFilter.connect(comp);
  comp.connect(compMakeup);
  compMakeup.connect(eqBass);
  eqBass.connect(eqTreble);
  // de-esser は既定でバイパス（eqTreble → tremolo 直結）。
  // 内部結線だけ作っておき、deEss>0 のとき applyTrackEffectParams で差し込む。
  deEssLow1.connect(deEssLow2);
  deEssLow2.connect(deEssSum);
  deEssHigh1.connect(deEssHigh2);
  deEssHigh2.connect(deEssComp);
  deEssComp.connect(deEssSum);
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
  delayFeedback.connect(delayDamp);
  delayDamp.connect(delay);
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
    compMakeup,
    deEssComp,
    deEssLow1,
    deEssHigh1,
    deEssSum,
    deEssActive: false,
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
  nodes.compMakeup.gain.value = makeupGainFor(track.compressor);

  const deEss = track.deEss ?? 0;
  const wantDeEss = deEss > EPS;
  if (wantDeEss) {
    nodes.deEssComp.threshold.value = -18 - deEss * 22; // -18〜-40dB
    nodes.deEssComp.ratio.value = 2 + deEss * 10;
    nodes.deEssComp.knee.value = 2;
  }
  // 0時は色付け（コンプ遅延によるコムフィルタ）を避けるため経路ごとバイパス
  if (wantDeEss !== nodes.deEssActive) {
    try {
      if (wantDeEss) {
        nodes.eqTreble.disconnect(nodes.tremoloNode);
        nodes.eqTreble.connect(nodes.deEssLow1);
        nodes.eqTreble.connect(nodes.deEssHigh1);
        nodes.deEssSum.connect(nodes.tremoloNode);
      } else {
        nodes.eqTreble.disconnect(nodes.deEssLow1);
        nodes.eqTreble.disconnect(nodes.deEssHigh1);
        nodes.deEssSum.disconnect(nodes.tremoloNode);
        nodes.eqTreble.connect(nodes.tremoloNode);
      }
      nodes.deEssActive = wantDeEss;
    } catch {
      /* 接続失敗時は deEssActive を変えず次回に再試行 */
    }
  }

  applyTremoloModulation(ctx, nodes.tremoloDepth, nodes.tremoloNode, track.tremolo);
};

export const setTrackOutputVolume = (nodes: TrackEffectNodes, volume: number) => {
  nodes.outGain.gain.value = volume;
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
    comp.knee.value = 6;
  } else {
    comp.threshold.value = 0;
    comp.ratio.value = 1;
  }
  const compMakeup = ctx.createGain();
  compMakeup.gain.value = makeupGainFor(track.compressor);

  const eqBass = ctx.createBiquadFilter();
  eqBass.type = "lowshelf";
  eqBass.frequency.value = 250;
  eqBass.gain.value = track.bass;

  const eqTreble = ctx.createBiquadFilter();
  eqTreble.type = "highshelf";
  eqTreble.frequency.value = 4000;
  eqTreble.gain.value = track.treble;

  // ディエッサー（4次クロスオーバー）
  const deEss = track.deEss ?? 0;
  const deEssFreq = 6500;
  const deEssLow1 = ctx.createBiquadFilter();
  const deEssLow2 = ctx.createBiquadFilter();
  const deEssHigh1 = ctx.createBiquadFilter();
  const deEssHigh2 = ctx.createBiquadFilter();
  for (const f of [deEssLow1, deEssLow2]) {
    f.type = "lowpass";
    f.frequency.value = deEssFreq;
    f.Q.value = 0.7071;
  }
  for (const f of [deEssHigh1, deEssHigh2]) {
    f.type = "highpass";
    f.frequency.value = deEssFreq;
    f.Q.value = 0.7071;
  }
  const deEssComp = ctx.createDynamicsCompressor();
  if (deEss > EPS) {
    deEssComp.threshold.value = -18 - deEss * 22;
    deEssComp.ratio.value = 2 + deEss * 10;
    deEssComp.knee.value = 2;
    deEssComp.attack.value = 0.001;
    deEssComp.release.value = 0.05;
  } else {
    deEssComp.threshold.value = 0;
    deEssComp.ratio.value = 1;
  }
  const deEssSum = ctx.createGain();

  const panner = ctx.createStereoPanner();
  panner.pan.value = track.pan;

  const fadeGain = ctx.createGain();
  const outGain = ctx.createGain();
  outGain.gain.value = track.volume;

  const chorusDelay = ctx.createDelay(0.1);
  chorusDelay.delayTime.value = 0.025;
  const chorusLfo = ctx.createOscillator();
  chorusLfo.frequency.value = 0.8;
  const chorusLfoDepth = ctx.createGain();
  chorusLfoDepth.gain.value = 0.004;
  chorusLfo.connect(chorusLfoDepth);
  chorusLfoDepth.connect(chorusDelay.delayTime);
  chorusLfo.start();
  const chorusGain = ctx.createGain();
  chorusGain.gain.value = track.chorus;

  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.35;
  const fb = ctx.createGain();
  fb.gain.value = 0.28;
  const delayDamp = ctx.createBiquadFilter();
  delayDamp.type = "lowpass";
  delayDamp.frequency.value = 3200;
  const delayGain = ctx.createGain();
  delayGain.gain.value = track.delay;

  const convolver = ctx.createConvolver();
  convolver.buffer = createBetterReverbIR(ctx);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = track.reverb;

  input.connect(noiseFilter);
  noiseFilter.connect(comp);
  comp.connect(compMakeup);
  compMakeup.connect(eqBass);
  eqBass.connect(eqTreble);
  if (deEss > EPS) {
    eqTreble.connect(deEssLow1);
    deEssLow1.connect(deEssLow2);
    deEssLow2.connect(deEssSum);
    eqTreble.connect(deEssHigh1);
    deEssHigh1.connect(deEssHigh2);
    deEssHigh2.connect(deEssComp);
    deEssComp.connect(deEssSum);
    deEssSum.connect(panner);
  } else {
    eqTreble.connect(panner);
  }

  panner.connect(fadeGain);
  panner.connect(chorusDelay);
  chorusDelay.connect(chorusGain);
  chorusGain.connect(fadeGain);
  panner.connect(delay);
  delay.connect(fb);
  fb.connect(delayDamp);
  delayDamp.connect(delay);
  delay.connect(delayGain);
  delayGain.connect(fadeGain);
  panner.connect(convolver);
  convolver.connect(reverbGain);
  reverbGain.connect(fadeGain);

  fadeGain.connect(outGain);
  outGain.connect(destination);

  return { fadeGain };
};
