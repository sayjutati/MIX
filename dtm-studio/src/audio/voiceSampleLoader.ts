/**
 * 録音した声をサンプラー音源用に前処理して sampleBank に登録する（メインスレッド専用）。
 * 前処理: モノラル化 → 無音トリム → 正規化 → ルート音推定 →
 *         ゼロクロス整列のサステインループ選定 → ループ境界のクロスフェード焼き込み
 */
import type { Project } from "../types/project";
import { getAudioAssetBlob } from "../storage/audioAssetStorage";
import { decodeAudioBlob } from "./decode";
import { getSample, setSample, type SampleData } from "./sampleBank";
import { initAudioGraph, sendSampleToSynth } from "./engine";
import { analyzePitch, midiFloatToFreq } from "../utils/pitchDetect";
import { estimateRootPitch } from "../utils/melodyExtract";

export type PreparedVoiceSample = SampleData & {
  /** ルート音（MIDI float） */
  rootPitch: number;
};

const mixToMono = (buffer: AudioBuffer): Float32Array => {
  const out = new Float32Array(buffer.length);
  const chs = buffer.numberOfChannels;
  for (let c = 0; c < chs; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < ch.length; i++) out[i] += ch[i]! / chs;
  }
  return out;
};

/** 直近の正方向ゼロクロスに位置を合わせる */
const snapToZeroCross = (data: Float32Array, idx: number, searchRange = 2000): number => {
  const lo = Math.max(1, idx - searchRange);
  const hi = Math.min(data.length - 1, idx + searchRange);
  let best = idx;
  let bestDist = Infinity;
  for (let i = lo; i < hi; i++) {
    if (data[i - 1]! <= 0 && data[i]! > 0) {
      const dist = Math.abs(i - idx);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
  }
  return best;
};

export function prepareVoiceSample(buffer: AudioBuffer): PreparedVoiceSample {
  const sampleRate = buffer.sampleRate;
  let data = mixToMono(buffer);

  // 無音トリム（ピークの 2% をしきい値、前後 10ms のマージン）
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]!));
  if (peak > 1e-6) {
    const th = peak * 0.02;
    let first = 0;
    let last = data.length - 1;
    while (first < data.length && Math.abs(data[first]!) < th) first++;
    while (last > first && Math.abs(data[last]!) < th) last--;
    const margin = Math.floor(sampleRate * 0.01);
    first = Math.max(0, first - margin);
    last = Math.min(data.length - 1, last + margin);
    data = data.slice(first, last + 1);
  }

  // 正規化（ピーク 0.9）
  peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]!));
  if (peak > 1e-6) {
    const g = 0.9 / peak;
    for (let i = 0; i < data.length; i++) data[i]! *= g;
  }

  // 端のクリック防止フェード（5ms）
  const fade = Math.min(Math.floor(sampleRate * 0.005), Math.floor(data.length / 4));
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    data[i]! *= w;
    data[data.length - 1 - i]! *= w;
  }

  // ルート音推定
  const frames = analyzePitch(data, sampleRate);
  const rootPitch = estimateRootPitch(frames) ?? 57; // 検出不能時は A3
  const rootHz = midiFloatToFreq(rootPitch);

  // サステインループ: 中盤 45%〜85% をゼロクロスに整列
  let loopStart = 0;
  let loopEnd = 0;
  const rawStart = Math.floor(data.length * 0.45);
  const rawEnd = Math.floor(data.length * 0.85);
  if (rawEnd - rawStart > sampleRate * 0.15) {
    loopStart = snapToZeroCross(data, rawStart);
    loopEnd = snapToZeroCross(data, rawEnd);
    const loopLen = loopEnd - loopStart;
    const xf = Math.min(Math.floor(sampleRate * 0.03), Math.floor(loopLen / 4), loopStart);
    if (loopLen > sampleRate * 0.1 && xf > 32) {
      // ループ終端手前 xf サンプルを、ループ開始点手前の波形とクロスフェードして
      // 終端→開始のジャンプを無音化する（等パワー、実行時コストゼロ）
      for (let i = 0; i < xf; i++) {
        const w = i / xf;
        const a = Math.cos((w * Math.PI) / 2);
        const b = Math.sin((w * Math.PI) / 2);
        const dst = loopEnd - xf + i;
        const src = loopStart - xf + i;
        data[dst] = data[dst]! * a + data[src]! * b;
      }
    } else {
      loopStart = 0;
      loopEnd = 0;
    }
  }

  return { data, sampleRate, rootHz, loopStart, loopEnd, rootPitch };
}

/** アセット ID からサンプルを読み込み、ローカルバンクに登録して返す */
export async function loadVoiceSampleFromAsset(assetId: string): Promise<SampleData | null> {
  const existing = getSample(assetId);
  if (existing) return existing;
  const blob = await getAudioAssetBlob(assetId);
  if (!blob) return null;
  const decodeCtx = new OfflineAudioContext(1, 1, 48000);
  const buffer = await decodeAudioBlob(blob, decodeCtx);
  const prepared = prepareVoiceSample(buffer);
  const sample: SampleData = {
    data: prepared.data,
    sampleRate: prepared.sampleRate,
    rootHz: prepared.rootHz,
    loopStart: prepared.loopStart,
    loopEnd: prepared.loopEnd,
  };
  setSample(assetId, sample);
  return sample;
}

const sentToWorklet = new Set<string>();

/**
 * プロジェクト内の voice 音源のサンプルをローカルバンクへロードし、
 * リアルタイム再生用に worklet へも転送する。
 */
export async function ensureVoiceSamples(project: Project): Promise<void> {
  const voiceInsts = project.instruments.filter(
    (i) => i.kind === "voice" && i.sampleAssetId
  );
  if (voiceInsts.length === 0) return;

  for (const inst of voiceInsts) {
    const assetId = inst.sampleAssetId!;
    const sample = await loadVoiceSampleFromAsset(assetId);
    if (!sample || sentToWorklet.has(assetId)) continue;
    try {
      const { synth } = await initAudioGraph();
      sendSampleToSynth(synth, assetId, sample);
      sentToWorklet.add(assetId);
    } catch {
      // AudioContext 未許可などは次回スケジュール時に再試行
    }
  }
}

/** オフラインレンダリング前にローカルバンクのみ準備する（worklet 不要） */
export async function ensureVoiceSamplesLocal(project: Project): Promise<void> {
  for (const inst of project.instruments) {
    if (inst.kind === "voice" && inst.sampleAssetId) {
      await loadVoiceSampleFromAsset(inst.sampleAssetId);
    }
  }
}
