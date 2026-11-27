import { allMixClips } from "./clipAudio";
import type { EditorState, TimelineClip } from "../types";
import { clipFadeGainAt } from "../types";

/** OfflineAudioContext.start が例外にならない範囲にクリップ窓を収める */
export const clipSourceWindow = (
  clip: Pick<TimelineClip, "start" | "duration" | "inPoint" | "speed">,
  bufDuration: number,
  mixDuration: number
): { when: number; offset: number; srcDur: number; timelineDur: number; skipTimelineSec: number; speed: number } | null => {
  const speed = clip.speed > 0 ? clip.speed : 1;
  const skipTimelineSec = clip.start < 0 ? -clip.start : 0;
  const when = Math.max(0, clip.start);
  if (when >= mixDuration || mixDuration <= 0) return null;
  const maxTimelineFromClip = clip.duration - skipTimelineSec;
  const timelineDur = Math.min(maxTimelineFromClip, mixDuration - when);
  if (timelineDur <= 0) return null;
  const offset = Math.min(Math.max(0, clip.inPoint + skipTimelineSec * speed), Math.max(0, bufDuration));
  const srcDur = Math.min(timelineDur * speed, Math.max(0, bufDuration - offset));
  if (srcDur <= 0.001) return null;
  return {
    when,
    offset,
    srcDur,
    timelineDur: srcDur / speed,
    skipTimelineSec,
    speed,
  };
};

const scheduleFadeCurve = (
  gain: GainNode,
  baseVolume: number,
  clipDuration: number,
  fadeIn: number,
  fadeOut: number,
  when: number,
  skipTimelineSec: number,
  playTimelineDur: number
) => {
  if (fadeIn <= 0.002 && fadeOut <= 0.002) {
    gain.gain.setValueAtTime(baseVolume, when);
    return;
  }
  const steps = Math.max(8, Math.min(64, Math.ceil(playTimelineDur * 20)));
  for (let i = 0; i <= steps; i++) {
    const rel = (playTimelineDur * i) / steps;
    const local = skipTimelineSec + rel;
    const env = clipFadeGainAt({ duration: clipDuration, fadeIn, fadeOut }, local);
    const t = when + rel;
    if (i === 0) gain.gain.setValueAtTime(baseVolume * env, t);
    else gain.gain.linearRampToValueAtTime(baseVolume * env, t);
  }
};

/** オフラインで全音声トラックを1本にミックス（書き出し用：プレビューと完全同一のフェード・音量・ソロ/ミュート） */
export const mixAudioOffline = async (
  state: EditorState,
  duration: number
): Promise<AudioBuffer | null> => {
  // プレビューでマスターミュートされていても書き出しファイルには音声を含めるか？
  // → トラックM/Sやクリップ音声OFFは反映し、モニター消音ボタン(audioEnabled)のみモニター専用とする（既存仕様維持）
  const clips = allMixClips(state);
  if (!clips.length) return null;

  const sampleRate = 48000;
  const length = Math.ceil(duration * sampleRate);
  if (length <= 0) return null;
  const ctx = new OfflineAudioContext(2, length, sampleRate);

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

  for (const { clip, asset, baseVolume, fadeIn, fadeOut } of clips) {
    const buf = await decode(asset.url);
    if (!buf) continue;
    const window = clipSourceWindow(clip, buf.duration, duration);
    if (!window) continue;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = window.speed;
    const gain = ctx.createGain();
    scheduleFadeCurve(
      gain,
      baseVolume,
      clip.duration,
      fadeIn,
      fadeOut,
      window.when,
      window.skipTimelineSec,
      window.timelineDur
    );
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
