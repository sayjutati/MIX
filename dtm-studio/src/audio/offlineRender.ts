import type { Project } from "../types/project";
import { beatToSec } from "../types/project";
import type { NoteEvent } from "./synthCore";
import {
  createVoice,
  MAX_VOICES,
  renderVoicesAtTime,
} from "./synthCore";

/** プロジェクトの終端拍（書き出し長さ用） */
export const projectEndBeat = (project: Project): number => {
  let end = Math.max(project.loopEnd, 4);
  for (const track of project.tracks) {
    for (const n of track.notes) {
      end = Math.max(end, n.start + n.duration + 0.5);
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
    if (track.muted) continue;
    if (hasSolo && !track.solo) continue;
    const inst = project.instruments.find((i) => i.id === track.instrumentId);
    if (!inst) continue;

    for (const note of track.notes) {
      if (note.start >= end || note.start + note.duration <= startBeat) continue;
      const startSec = beatToSec(note.start - startBeat, tempo);
      const durationSec = beatToSec(note.duration, tempo);
      out.push({
        startSec,
        endSec: startSec + durationSec,
        pitch: note.pitch,
        velocity: note.velocity,
        waveform: inst.params.waveform,
        adsr: { ...inst.params },
        pan: track.pan,
        volume: track.volume,
      });
    }
  }

  out.sort((a, b) => a.startSec - b.startSec);
  return out;
};

export type RenderOpts = {
  sampleRate?: number;
  startBeat?: number;
  endBeat?: number;
  tailSec?: number;
};

/** オフラインでプロジェクトをステレオ AudioBuffer にレンダリング */
export const renderProjectOffline = (
  project: Project,
  opts: RenderOpts = {}
): AudioBuffer => {
  const sampleRate = opts.sampleRate ?? 44100;
  const startBeat = opts.startBeat ?? 0;
  const endBeat = opts.endBeat ?? projectEndBeat(project);
  const tailSec = opts.tailSec ?? 0.5;
  const coreDuration = beatToSec(endBeat - startBeat, project.tempo);
  const totalSec = coreDuration + tailSec;
  const length = Math.max(1, Math.ceil(totalSec * sampleRate));

  const events = collectNoteEvents(project, startBeat, endBeat);
  const voices = Array.from({ length: MAX_VOICES }, createVoice);
  const eventIdx = { i: 0 };

  const left = new Float32Array(length);
  const right = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const { l, r } = renderVoicesAtTime(voices, events, eventIdx, t, sampleRate);
    left[i] = l;
    right[i] = r;
  }

  const buffer = new AudioBuffer({ length, numberOfChannels: 2, sampleRate });
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
