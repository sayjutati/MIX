import type { Instrument, Project, Track } from "../types/project";
import { beatToSec, isAudioTrack } from "../types/project";
import type { DrumKind } from "./oscCore";
import { resolveVoiceParams } from "./instrumentVoice";
import type { VoicePatch } from "./voicePatch";

const WORKLET_BASE = `${import.meta.env.BASE_URL}worklets/`;

let ctxSingleton: AudioContext | null = null;
let clockNode: AudioWorkletNode | null = null;
let synthNode: AudioWorkletNode | null = null;
let loadPromise: Promise<void> | null = null;

export const SCHEDULE_AHEAD_SEC = 0.25;
export const LOOKAHEAD_MS = 25;

export type ClockPosition = { beat: number; ctxTime: number };

export async function getAudioContext(): Promise<AudioContext> {
  if (!ctxSingleton || ctxSingleton.state === "closed") {
    ctxSingleton = new AudioContext({ latencyHint: "playback" });
  }
  if (ctxSingleton.state === "suspended") {
    await ctxSingleton.resume();
  }
  return ctxSingleton;
}

async function ensureWorklets(ctx: AudioContext) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    await ctx.audioWorklet.addModule(`${WORKLET_BASE}clock-processor.js`);
    await ctx.audioWorklet.addModule(`${WORKLET_BASE}synth-processor.js`);
  })();
  await loadPromise;
}

export async function initAudioGraph(): Promise<{
  ctx: AudioContext;
  clock: AudioWorkletNode;
  synth: AudioWorkletNode;
}> {
  const ctx = await getAudioContext();
  await ensureWorklets(ctx);

  if (!clockNode) {
    clockNode = new AudioWorkletNode(ctx, "dtm-clock", { numberOfOutputs: 1, outputChannelCount: [2] });
    clockNode.connect(ctx.destination);
  }
  if (!synthNode) {
    synthNode = new AudioWorkletNode(ctx, "dtm-synth", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    synthNode.connect(ctx.destination);
  }
  return { ctx, clock: clockNode, synth: synthNode };
}

export function startTransport(
  clock: AudioWorkletNode,
  synth: AudioWorkletNode,
  ctx: AudioContext,
  startBeat: number,
  tempo: number
) {
  const baseCtxTime = ctx.currentTime + 0.05;
  clock.port.postMessage({ type: "start", baseCtxTime, baseBeat: startBeat, tempo });
  synth.port.postMessage({ type: "transport", action: "start", baseCtxTime });
}

export function stopTransport(clock: AudioWorkletNode, synth: AudioWorkletNode) {
  clock.port.postMessage({ type: "stop" });
  synth.port.postMessage({ type: "transport", action: "stop" });
}

export function seekTransport(
  clock: AudioWorkletNode,
  synth: AudioWorkletNode,
  ctx: AudioContext,
  beat: number,
  tempo: number
) {
  const t = ctx.currentTime + 0.02;
  clock.port.postMessage({ type: "seek", beat, ctxTime: t, tempo });
  synth.port.postMessage({ type: "transport", action: "start", baseCtxTime: t });
  synth.port.postMessage({ type: "clearQueue" });
}

export type NoteSchedulePayload = {
  noteId: string;
  ctxTime: number;
  pitch: number;
  velocity: number;
  durationSec: number;
  noteOffTime: number;
  waveform: Instrument["params"]["waveform"];
  adsr: Pick<Instrument["params"], "attack" | "decay" | "sustain" | "release">;
  pan: number;
  volume: number;
  drumKind?: DrumKind;
  patch?: VoicePatch;
};

export function scheduleNotesToSynth(synth: AudioWorkletNode, notes: NoteSchedulePayload[]) {
  if (notes.length === 0) return;
  synth.port.postMessage({
    type: "schedule",
    notes: notes.map((n) => ({
      ctxTime: n.ctxTime,
      pitch: n.pitch,
      velocity: n.velocity,
      durationSec: n.durationSec,
      noteOffTime: n.noteOffTime,
      waveform: n.waveform,
      adsr: {
        attack: n.adsr.attack,
        decay: n.adsr.decay,
        sustain: n.adsr.sustain,
        release: n.adsr.release,
      },
      pan: n.pan,
      volume: n.volume,
      drumKind: n.drumKind,
      patch: n.patch,
    })),
  });
}

export function buildNoteSchedules(
  project: Project,
  beatWindowStart: number,
  beatWindowEnd: number,
  anchorCtxTime: number,
  anchorBeat: number,
  tempo: number,
  cycleId = 0
): NoteSchedulePayload[] {
  const hasSolo = project.tracks.some((t) => t.solo);
  const out: NoteSchedulePayload[] = [];

  for (const track of project.tracks) {
    if (isAudioTrack(track)) continue;
    if (track.muted) continue;
    if (hasSolo && !track.solo) continue;
    const inst = project.instruments.find((i) => i.id === track.instrumentId);
    if (!inst) continue;

    for (const note of track.notes) {
      const noteEnd = note.start + note.duration;
      if (noteEnd <= beatWindowStart || note.start >= beatWindowEnd) continue;

      const beatOffset = note.start - anchorBeat;
      const ctxTime = anchorCtxTime + beatToSec(beatOffset, tempo);
      const durationSec = beatToSec(note.duration, tempo);
      const voice = resolveVoiceParams(inst, note.pitch);
      const master = project.masterVolume ?? 1;
      out.push({
        noteId: `${cycleId}:${track.id}:${note.id}`,
        ctxTime,
        pitch: voice.pitch,
        velocity: note.velocity,
        durationSec,
        noteOffTime: ctxTime + durationSec,
        waveform: voice.waveform,
        adsr: voice.adsr,
        pan: track.pan,
        volume: track.volume * master,
        drumKind: voice.drumKind,
        patch: voice.patch,
      });
    }
  }
  return out;
}

export function audibleTracks(project: Project): Track[] {
  const hasSolo = project.tracks.some((t) => t.solo);
  return project.tracks.filter((t) => !t.muted && (!hasSolo || t.solo));
}

export function onClockPosition(clock: AudioWorkletNode, fn: (pos: ClockPosition) => void) {
  const handler = (ev: MessageEvent) => {
    if (ev.data?.type === "position") fn({ beat: ev.data.beat, ctxTime: ev.data.ctxTime });
  };
  clock.port.addEventListener("message", handler);
  return () => clock.port.removeEventListener("message", handler);
}

export function beatAtCtxTime(
  ctxTime: number,
  anchorCtxTime: number,
  anchorBeat: number,
  tempo: number
) {
  return anchorBeat + ((ctxTime - anchorCtxTime) * tempo) / 60;
}

export function ctxTimeAtBeat(
  beat: number,
  anchorCtxTime: number,
  anchorBeat: number,
  tempo: number
) {
  return anchorCtxTime + beatToSec(beat - anchorBeat, tempo);
}
