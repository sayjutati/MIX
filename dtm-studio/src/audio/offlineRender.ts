import type { Project } from "../types/project";
import { beatToSec, isAudioTrack } from "../types/project";
import { clipEndBeat } from "./audioClipPlayer";
import type { NoteEvent } from "./synthCore";
import { resolveVoiceParams } from "./instrumentVoice";
import {
  createVoice,
  MAX_VOICES,
  renderVoicesAtTime,
} from "./synthCore";
import { getAudioAssetBlob } from "../storage/audioAssetStorage";
import { decodeAudioBlob } from "./decode";
import { ensureVoiceSamplesLocal } from "./voiceSampleLoader";

/** プロジェクトの終端拍（書き出し長さ用） */
export const projectEndBeat = (project: Project): number => {
  let end = Math.max(project.loopEnd, 4);
  for (const track of project.tracks) {
    for (const n of track.notes) {
      end = Math.max(end, n.start + n.duration + 0.5);
    }
    if (isAudioTrack(track)) {
      for (const c of track.clips ?? []) {
        end = Math.max(end, clipEndBeat(c, project.tempo) + 0.5);
      }
    }
  }
  return end;
};

/** 再生可能トラックからノートイベント一覧を生成 */
export const collectNoteEvents = (
  project: Project,
  startBeat = 0,
  endBeat?: number
): NoteEvent[] => {
  const end = endBeat ?? projectEndBeat(project);
  const tempo = project.tempo;
  const hasSolo = project.tracks.some((t) => t.solo);
  const out: NoteEvent[] = [];

  for (const track of project.tracks) {
    if (isAudioTrack(track)) continue;
    if (track.muted) continue;
    if (hasSolo && !track.solo) continue;
    const inst = project.instruments.find((i) => i.id === track.instrumentId);
    if (!inst) continue;

    for (const note of track.notes) {
      if (note.start >= end || note.start + note.duration <= startBeat) continue;
      const startSec = beatToSec(note.start - startBeat, tempo);
      const durationSec = beatToSec(note.duration, tempo);
      const voice = resolveVoiceParams(inst, note.pitch);
      const master = project.masterVolume ?? 1;
      out.push({
        startSec,
        endSec: startSec + durationSec,
        pitch: voice.pitch,
        velocity: note.velocity,
        waveform: voice.waveform,
        adsr: { ...voice.adsr },
        pan: track.pan,
        volume: track.volume * master,
        drumKind: voice.drumKind,
        patch: voice.patch,
        sampleId: voice.sampleId,
      });
    }
  }

  out.sort((a, b) => a.startSec - b.startSec);
  return out;
};

const mixAudioClipInto = (
  left: Float32Array,
  right: Float32Array,
  buffer: AudioBuffer,
  startSample: number,
  offsetSec: number,
  durationSec: number,
  volume: number,
  pan: number,
  sampleRate: number
) => {
  const startOffset = Math.floor(offsetSec * sampleRate);
  const len = Math.min(
    Math.floor(durationSec * sampleRate),
    buffer.length - startOffset,
    left.length - startSample
  );
  const chL = buffer.getChannelData(0);
  const chR = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : chL;
  const panL = pan <= 0 ? 1 : 1 - pan;
  const panR = pan >= 0 ? 1 : 1 + pan;
  const gain = volume * 0.85;

  for (let i = 0; i < len; i++) {
    const si = startOffset + i;
    const di = startSample + i;
    if (di >= left.length || si >= buffer.length) break;
    left[di] += chL[si] * gain * panL;
    right[di] += chR[si] * gain * panR;
  }
};

async function mixAudioTracks(
  project: Project,
  left: Float32Array,
  right: Float32Array,
  startBeat: number,
  sampleRate: number
): Promise<void> {
  const hasSolo = project.tracks.some((t) => t.solo);
  const master = project.masterVolume ?? 1;
  const tempo = project.tempo;

  for (const track of project.tracks) {
    if (!isAudioTrack(track)) continue;
    if (track.muted) continue;
    if (hasSolo && !track.solo) continue;

    for (const clip of track.clips ?? []) {
      const blob = await getAudioAssetBlob(clip.assetId);
      if (!blob) continue;
      const offline = new OfflineAudioContext(2, 1, sampleRate);
      const buffer = await decodeAudioBlob(blob, offline);
      const clipStartSec = beatToSec(clip.startBeat - startBeat, tempo);
      const startSample = Math.max(0, Math.floor(clipStartSec * sampleRate));
      mixAudioClipInto(
        left,
        right,
        buffer,
        startSample,
        clip.trimStart,
        clip.durationSec,
        track.volume * master,
        track.pan,
        sampleRate
      );
    }
  }
}

export type RenderOpts = {
  sampleRate?: number;
  startBeat?: number;
  endBeat?: number;
  tailSec?: number;
};

/** オフラインでプロジェクトをステレオ AudioBuffer にレンダリング */
export const renderProjectOffline = async (
  project: Project,
  opts: RenderOpts = {}
): Promise<AudioBuffer> => {
  const sampleRate = opts.sampleRate ?? 44100;
  const startBeat = opts.startBeat ?? 0;
  const endBeat = opts.endBeat ?? projectEndBeat(project);
  const tailSec = opts.tailSec ?? 0.5;
  const coreDuration = beatToSec(endBeat - startBeat, project.tempo);
  const totalSec = coreDuration + tailSec;
  const length = Math.max(1, Math.ceil(totalSec * sampleRate));

  if (project.instruments.some((i) => i.kind === "voice" && i.sampleAssetId)) {
    await ensureVoiceSamplesLocal(project);
  }

  const events = collectNoteEvents(project, startBeat, endBeat);
  const voices = Array.from({ length: MAX_VOICES }, createVoice);
  const eventIdx = { i: 0 };
  const masterLpL = { v: 0 };
  const masterLpR = { v: 0 };

  const left = new Float32Array(length);
  const right = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const { l, r } = renderVoicesAtTime(
      voices,
      events,
      eventIdx,
      t,
      sampleRate,
      masterLpL,
      masterLpR
    );
    left[i] = l;
    right[i] = r;
  }

  const buffer = new AudioBuffer({ length, numberOfChannels: 2, sampleRate });
  buffer.copyToChannel(left, 0);
  buffer.copyToChannel(right, 1);

  await mixAudioTracks(project, left, right, startBeat, sampleRate);

  buffer.copyToChannel(left, 0);
  buffer.copyToChannel(right, 1);
  return buffer;
};

export const bufferPeak = (buffer: AudioBuffer): number => {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < ch.length; i++) {
      peak = Math.max(peak, Math.abs(ch[i]));
    }
  }
  return peak;
};

export const normalizeBuffer = (buffer: AudioBuffer, target = 0.89): void => {
  const peak = bufferPeak(buffer);
  if (peak < 1e-6) return;
  const g = target / peak;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < ch.length; i++) ch[i] *= g;
  }
};
