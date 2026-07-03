/**
 * サンプラー用サンプルバンク。
 * メインスレッド（オフラインレンダリング）と AudioWorklet の両方で
 * それぞれのコンテキストにインスタンス化される（worklet へは port 経由で登録）。
 */

export type SampleData = {
  /** モノラル波形（正規化・トリム済み） */
  data: Float32Array;
  sampleRate: number;
  /** 録音の基本周波数（ピッチシフトの基準） */
  rootHz: number;
  /** サステインループ開始（サンプル位置）。loopEnd <= loopStart でループなし */
  loopStart: number;
  loopEnd: number;
};

const bank = new Map<string, SampleData>();

export const setSample = (id: string, sample: SampleData) => {
  bank.set(id, sample);
};

export const getSample = (id: string): SampleData | undefined => bank.get(id);

export const hasSample = (id: string): boolean => bank.has(id);

/** サンプルを線形補間で読む。範囲外は 0 */
export const readSampleLinear = (s: SampleData, pos: number): number => {
  if (pos < 0 || pos >= s.data.length - 1) return 0;
  const i = Math.floor(pos);
  const frac = pos - i;
  return s.data[i]! * (1 - frac) + s.data[i + 1]! * frac;
};
