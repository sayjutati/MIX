/** 拍単位でグリッドにスナップ */
export const snapBeat = (beat: number, grid: number) => {
  if (grid <= 0) return beat;
  return Math.round(beat / grid) * grid;
};

export const QUANTIZE_OPTIONS = [
  { label: "1/4", value: 1 },
  { label: "1/8", value: 0.5 },
  { label: "1/16", value: 0.25 },
  { label: "1/32", value: 0.125 },
] as const;

export type QuantizeGrid = (typeof QUANTIZE_OPTIONS)[number]["value"];
