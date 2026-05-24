import type { Track } from "../types";
import { connectOfflineTrackChain } from "./chain";

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

export const renderMixdown = async (
  tracks: Track[],
  hasSolo: boolean,
  masterVolume: number,
  sampleRate = 44100
): Promise<AudioBuffer> => {
  const totalDur = Math.max(
    1,
    ...tracks.map((t) => t.offset + (t.duration || 0))
  );
  const offlineCtx = new OfflineAudioContext(
    2,
    Math.ceil(sampleRate * totalDur),
    sampleRate
  );
  const master = offlineCtx.createGain();
  master.gain.value = masterVolume;
  master.connect(offlineCtx.destination);

  for (const track of tracks) {
    if (track.isMuted || (hasSolo && !track.isSolo)) continue;
    const res = await fetch(track.url);
    const buf = await offlineCtx.decodeAudioData(await res.arrayBuffer());
    const clipDur = buf.duration / track.speed;
    const src = offlineCtx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = track.speed;

    const { fadeGain } = connectOfflineTrackChain(
      offlineCtx,
      src,
      track,
      master
    );

    if (track.fadeIn > 0 || track.fadeOut > 0) {
      applyOfflineFade(fadeGain, track, track.offset, clipDur);
    } else {
      fadeGain.gain.value = 1;
    }

    src.start(track.offset);
  }

  return offlineCtx.startRendering();
};
