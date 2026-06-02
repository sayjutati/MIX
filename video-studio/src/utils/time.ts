import { DEFAULT_FPS } from "../types";

export const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  const f = Math.floor((seconds % 1) * DEFAULT_FPS)
    .toString()
    .padStart(2, "0");
  if (h > 0) {
    return `${h}:${m}:${s}:${f}`;
  }
  return `${m}:${s}:${f}`;
};

export const snapTime = (t: number, grid: number, enabled: boolean) => {
  if (!enabled || grid <= 0) return Math.max(0, t);
  return Math.max(0, Math.round(t / grid) * grid);
};
