import { allMixClips } from "./clipAudio";
import type { EditorState } from "../types";

/** オフラインで全音声トラックを1本にミックス（書き出し用） */
export const mixAudioOffline = async (
  state: EditorState,
  duration: number
): Promise<AudioBuffer | null> => {
  const clips = allMixClips(state);
  if (!clips.length) return null;

  const sampleRate = 48000;
  const length = Math.ceil(duration * sampleRate);
  const ctx = new OfflineAudioContext(2, length, sampleRate);

  for (const { clip, asset, effectiveVolume } of clips) {
    try {
      const res = await fetch(asset.url);
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = clip.speed;
      const gain = ctx.createGain();
      gain.gain.value = effectiveVolume;
      src.connect(gain);
      gain.connect(ctx.destination);
      const offset = clip.inPoint;
      const when = clip.start;
      const dur = Math.min(clip.duration, duration - when);
      if (dur > 0) src.start(when, offset, dur);
    } catch {
      /* skip undecodable */
    }
  }

  return ctx.startRendering();
};
