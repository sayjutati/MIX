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
    const speed = clip.speed > 0 ? clip.speed : 1;
    const timelineDur = Math.min(clip.duration, duration - clip.start);
    if (timelineDur <= 0) continue;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = speed;
    const gain = ctx.createGain();
    gain.gain.value = effectiveVolume;
    src.connect(gain);
    gain.connect(ctx.destination);
    // start() の duration は再生レートに依らずバッファ時間
    src.start(clip.start, clip.inPoint, timelineDur * speed);
  }

  return ctx.startRendering();
};
