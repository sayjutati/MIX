import { DEFAULT_FPS } from "../types";

export const formatTime = (seconds: number, fps = DEFAULT_FPS) => {
  const safe = Math.max(0, seconds);
  const safeFps = Math.max(1, Math.round(fps || DEFAULT_FPS));
  const totalFrames = Math.round(safe * safeFps);
  const f = (totalFrames % safeFps).toString().padStart(2, "0");
  const totalSec = Math.floor(totalFrames / safeFps);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  if (h > 0) {
    return `${h}:${m}:${s}:${f}`;
  }
  return `${m}:${s}:${f}`;
};

export const formatRulerTime = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const whole = Math.floor(safe + 1e-4);
  const frac = safe - whole;
  const m = Math.floor(whole / 60);
  const s = (whole % 60).toString().padStart(2, "0");
  if (frac > 0.05) {
    return `${m}:${s}.${Math.round(frac * 10)}`;
  }
  return `${m}:${s}`;
};

export const snapTime = (t: number, grid: number, enabled: boolean) => {
  if (!enabled || grid <= 0) return Math.max(0, t);
  return Math.max(0, Math.round(t / grid) * grid);
};
