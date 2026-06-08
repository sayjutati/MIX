import type { Clip, Track } from "../types";
import { clipEffectiveOffset, clipPlayDuration } from "../types";
import { connectOfflineTrackChain } from "./chain";
import { renderPitchCorrected } from "./pitch";

export const audioBufferToWav = (buffer: AudioBuffer) => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  const result = new Float32Array(buffer.length * numChannels);
  if (numChannels === 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let i = 0; i < buffer.length; i++) {
      result[i * 2] = left[i];
      result[i * 2 + 1] = right[i];
    }
  } else {
    result.set(buffer.getChannelData(0));
  }
  const dataLength = result.length * (bitDepth / 8);
  const bufferArr = new ArrayBuffer(44 + dataLength);
  const view = new DataView(bufferArr);
  const writeString = (v: DataView, o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);
  let offset = 44;
  for (let i = 0; i < result.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, result[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
};

const applyOfflineFade = (
  fadeGain: GainNode,
  track: Track,
  startSec: number,
  duration: number
) => {
  const endSec = startSec + duration;
  fadeGain.gain.setValueAtTime(0, startSec);
  if (track.fadeIn > 0) {
    fadeGain.gain.linearRampToValueAtTime(1, startSec + track.fadeIn);
  } else {
    fadeGain.gain.setValueAtTime(1, startSec);
  }
  if (track.fadeOut > 0) {
    fadeGain.gain.setValueAtTime(1, Math.max(startSec, endSec - track.fadeOut));
    fadeGain.gain.linearRampToValueAtTime(0, endSec);
  } else {
    fadeGain.gain.setValueAtTime(1, endSec);
  }
};

const notesNeedPitch = (clip: Clip) =>
  !!clip.notes?.some((n) => Math.round(n.shift) !== 0);

/** 書き出し用バッファ（ピッチ編集は「適用」不要で反映） */
const resolveClipBuffer = async (
  clip: Clip,
  offlineCtx: OfflineAudioContext,
  pitchLimit: number
): Promise<AudioBuffer> => {
  const loadUrl = async (url: string) => {
    const res = await fetch(url);
    return offlineCtx.decodeAudioData(await res.arrayBuffer());
  };

  if (notesNeedPitch(clip) && clip.notes) {
    const srcUrl = clip.originalUrl ?? clip.url;
    const src = await loadUrl(srcUrl);
    return renderPitchCorrected(src, clip.notes, pitchLimit);
  }
  return loadUrl(clip.url);
};

export type MixdownOpts = {
  sampleRate?: number;
  normalize?: boolean;
  pitchLimit?: number;
};

export const renderMixdown = async (
  tracks: Track[],
  hasSolo: boolean,
  masterVolume: number,
  opts: MixdownOpts = {}
): Promise<AudioBuffer> => {
  const sampleRate = opts.sampleRate ?? 44100;
  const pitchLimit = opts.pitchLimit ?? 2;
  const ends = tracks.flatMap((t) =>
    t.clips
      .filter((c) => !c.muted)
      .map((c) => clipEffectiveOffset(t, c) + clipPlayDuration(t, c))
  );
  const totalDur = Math.max(1, ...ends);
  const offlineCtx = new OfflineAudioContext(
    2,
    Math.ceil(sampleRate * totalDur),
    sampleRate
  );
  const master = offlineCtx.createGain();
  master.gain.value = masterVolume;

  const limiter = offlineCtx.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;
  master.connect(limiter);
  limiter.connect(offlineCtx.destination);

  for (const track of tracks) {
    if (track.isMuted || (hasSolo && !track.isSolo)) continue;
    const activeClips = track.clips.filter((c) => !c.muted);
    if (activeClips.length === 0) continue;

    const clipBus = offlineCtx.createGain();
    connectOfflineTrackChain(offlineCtx, clipBus, track, master);

    for (const clip of activeClips) {
      const buf = await resolveClipBuffer(clip, offlineCtx, pitchLimit);
      const clipDur = buf.duration / track.speed;

      const src = offlineCtx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = track.speed;
      src.detune.value = (track.pitch ?? 0) * 100;

      const fadeGain = offlineCtx.createGain();
      src.connect(fadeGain);
      fadeGain.connect(clipBus);

      const startAt = clipEffectiveOffset(track, clip);
      if (track.fadeIn > 0 || track.fadeOut > 0) {
        applyOfflineFade(fadeGain, track, startAt, clipDur);
      } else {
        fadeGain.gain.value = 1;
      }

      src.start(startAt);
    }
  }

  const rendered = await offlineCtx.startRendering();

  if (opts.normalize) {
    let peak = 0;
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
      const data = rendered.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
    }
    const target = 0.89;
    if (peak > 0.0001 && Math.abs(peak - target) > 0.01) {
      const gain = target / peak;
      for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
        const data = rendered.getChannelData(ch);
        for (let i = 0; i < data.length; i++) data[i] *= gain;
      }
    }
  }

  return rendered;
};

/** 1トラックをステムとして書き出し */
export const renderTrackStem = async (
  track: Track,
  masterVolume: number,
  opts: MixdownOpts = {}
): Promise<AudioBuffer | null> => {
  if (track.clips.every((c) => c.muted)) return null;
  return renderMixdown([track], false, masterVolume, opts);
};
