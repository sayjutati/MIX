import { allMixClips } from "./clipAudio";
import type { EditorState, TimelineClip } from "../types";

/** OfflineAudioContext.start が例外にならない範囲にクリップ窓を収める */
export const clipSourceWindow = (
  clip: Pick<TimelineClip, "start" | "duration" | "inPoint" | "speed">,
  bufDuration: number,
  mixDuration: number
): { when: number; offset: number; srcDur: number; speed: number } | null => {
  const speed = clip.speed > 0 ? clip.speed : 1;
  const timelineDur = Math.min(clip.duration, mixDuration - Math.max(0, clip.start));
  if (timelineDur <= 0 || mixDuration <= 0) return null;
  const when = Math.max(0, clip.start);
  if (when >= mixDuration) return null;
  const skipSec = clip.start < 0 ? -clip.start * speed : 0;
  const offset = Math.min(Math.max(0, clip.inPoint + skipSec), Math.max(0, bufDuration));
  const srcDur = Math.min(timelineDur * speed, Math.max(0, bufDuration - offset));
  if (srcDur <= 0.001) return null;
  return { when, offset, srcDur, speed };
};

/** オフラインで全音声トラックを1本にミックス（書き出し用） */
export const mixAudioOffline = async (
  state: EditorState,
  duration: number
): Promise<AudioBuffer | null> => {
  const clips = allMixClips(state);
  if (!clips.length) return null;

  const sampleRate = 48000;
  const length = Math.ceil(duration * sampleRate);
  if (length <= 0) return null;
  const ctx = new OfflineAudioContext(2, length, sampleRate);

  // 同じ素材を複数クリップで使っても 1 回だけデコードする
  const decoded = new Map<string, Promise<AudioBuffer | null>>();
  const decode = (url: string) => {
    let p = decoded.get(url);
    if (!p) {
      p = fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data))
        .catch(() => null);
      decoded.set(url, p);
    }
    return p;
  };

  for (const { clip, asset, effectiveVolume } of clips) {
    const buf = await decode(asset.url);
    if (!buf) continue;
    const window = clipSourceWindow(clip, buf.duration, duration);
    if (!window) continue;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = window.speed;
    const gain = ctx.createGain();
    gain.gain.value = effectiveVolume;
    src.connect(gain);
    gain.connect(ctx.destination);
    try {
      src.start(window.when, window.offset, window.srcDur);
    } catch {
      src.disconnect();
      gain.disconnect();
    }
  }

  return ctx.startRendering();
};
