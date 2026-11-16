import { bufferToMono } from "./pitch";
import { MIC_GAIN_DEFAULT } from "./recording";

/** ゲインアップ後に 0dBFS を超えた分だけ全体を下げる。in-place */
const limitPeak = (buf: AudioBuffer, ceiling = 0.98) => {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]!));
  }
  if (peak <= ceiling) return buf;
  const k = ceiling / peak;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) ch[i]! *= k;
  }
  return buf;
};

/** 10ms フレームの RMS 下位 15% をノイズ床とみなす */
export const estimateNoiseFloor = (mono: Float32Array, hop: number) => {
  if (mono.length < hop) {
    let s = 0;
    for (let i = 0; i < mono.length; i++) s += mono[i]! ** 2;
    return Math.sqrt(s / Math.max(1, mono.length));
  }
  const frames: number[] = [];
  for (let i = 0; i + hop <= mono.length; i += hop) {
    let s = 0;
    for (let j = 0; j < hop; j++) s += mono[i + j]! ** 2;
    frames.push(Math.sqrt(s / hop));
  }
  frames.sort((a, b) => a - b);
  return frames[Math.floor(frames.length * 0.15)] ?? 0;
};

/** ノイズゲート（ソフトニー）。in-place */
export const applyNoiseGate = (buf: AudioBuffer, floorRms: number) => {
  const hop = Math.max(64, Math.round(buf.sampleRate * 0.01));
  const openAt = Math.max(0.0035, floorRms * 3.4);
  const closeAt = openAt * 0.55;
  const chs = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const n = buf.length;
  let open = false;
  let gain = 0.08;
  for (let i = 0; i < n; i += hop) {
    const end = Math.min(n, i + hop);
    let s = 0;
    const mid = chs[0]!;
    for (let j = i; j < end; j++) s += mid[j]! ** 2;
    const rms = Math.sqrt(s / (end - i));
    if (rms > openAt) open = true;
    else if (rms < closeAt) open = false;
    const target = open ? 1 : 0.06;
    const coeff = open ? 0.45 : 0.18;
    gain += (target - gain) * coeff;
    for (const ch of chs) {
      for (let j = i; j < end; j++) ch[j]! *= gain;
    }
  }
  return buf;
};

/** オフライン処理に失敗したときの入力ゲイン。in-place */
export const applyBufferGain = (buf: AudioBuffer, amount: number) => {
  if (amount === 1) return buf;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) ch[i]! *= amount;
  }
  return limitPeak(buf);
};

/** 録音クリップ用：入力ゲイン＋ハイパス＋軽いコンプ＋ゲート（端末内） */
export const cleanRecordedVocal = async (
  buffer: AudioBuffer,
  inputGainAmount = MIC_GAIN_DEFAULT
): Promise<AudioBuffer> => {
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const inputGain = ctx.createGain();
  inputGain.gain.value = inputGainAmount;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 95;
  hp.Q.value = 0.7;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 10500;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.knee.value = 10;
  comp.ratio.value = 2.8;
  comp.attack.value = 0.006;
  comp.release.value = 0.14;
  src.connect(inputGain);
  inputGain.connect(hp);
  hp.connect(lp);
  lp.connect(comp);
  comp.connect(ctx.destination);
  src.start();
  const rendered = limitPeak(await ctx.startRendering());
  const floor = estimateNoiseFloor(bufferToMono(rendered), Math.round(rendered.sampleRate * 0.01));
  return applyNoiseGate(rendered, floor);
};
