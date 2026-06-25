/** 拍単位でグリッドにスナップ */
export const snapBeat = (beat: number, grid: number) => {
  if (grid <= 0) return beat;
  return Math.round(beat / grid) * grid;
};

export const maybeSnapBeat = (beat: number, grid: number, snap: boolean) =>
  snap ? snapBeat(beat, grid) : Math.max(0, beat);

export const QUANTIZE_OPTIONS = [
  { label: "4分音符", value: 1 },
  { label: "8分音符", value: 0.5 },
  { label: "16分音符", value: 0.25 },
  { label: "32分音符", value: 0.125 },
] as const;

export type QuantizeGrid = (typeof QUANTIZE_OPTIONS)[number]["value"];
