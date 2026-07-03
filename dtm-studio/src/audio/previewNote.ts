import type { Instrument, Track } from "../types/project";
import { initAudioGraph, scheduleNotesToSynth } from "./engine";
import { resolveVoiceParams } from "./instrumentVoice";

export async function previewNote(
  pitch: number,
  velocity: number,
  instrument: Instrument,
  track: Pick<Track, "pan" | "volume">
) {
  const { ctx, synth } = await initAudioGraph();
  const t = ctx.currentTime + 0.02;
  const dur = 0.35;
  const voice = resolveVoiceParams(instrument, pitch);
  scheduleNotesToSynth(synth, [
    {
      noteId: `pv-${pitch}-${t}`,
      ctxTime: t,
      pitch: voice.pitch,
      velocity,
      durationSec: dur,
      noteOffTime: t + dur,
      waveform: voice.waveform,
      adsr: voice.adsr,
      pan: track.pan,
      volume: track.volume,
      drumKind: voice.drumKind,
      patch: voice.patch,
      sampleId: voice.sampleId,
    },
  ]);
}
