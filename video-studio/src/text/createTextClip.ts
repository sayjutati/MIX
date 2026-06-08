import type { TextClip } from "../types";
import { defaultEffects } from "../types";
import { defaultTextStyle } from "./textStyle";
import type { TextStyle } from "./textStyle";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export interface NewTextClipOpts {
  trackId: string;
  start: number;
  duration?: number;
  text?: string;
  x?: number;
  y?: number;
  style?: TextStyle;
}

export const createTextClip = (opts: NewTextClipOpts): TextClip => ({
  id: uid(),
  assetId: "text-internal",
  trackId: opts.trackId,
  start: opts.start,
  duration: opts.duration ?? 3,
  inPoint: 0,
  speed: 1,
  volume: 1,
  opacity: 100,
  audioMuted: true,
  effects: defaultEffects(),
  opacityKeyframes: [],
  text: opts.text ?? "タイトル",
  x: opts.x ?? 0.5,
  y: opts.y ?? 0.5,
  style: opts.style ?? defaultTextStyle(),
});
