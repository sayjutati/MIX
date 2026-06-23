import type { Instrument, Track } from "../types/project";
import { initAudioGraph, scheduleNotesToSynth } from "./engine";

export async function previewNote(
  pitch: number,
  velocity: number,
  instrument: Instrument,
  track: Pick<Track, "pan" | "volume">
) {
  const { ctx, synth } = await initAudioGraph();
  const t = ctx.currentTime + 0.02;
  const dur = 0.35;
  scheduleNotesToSynth(synth, [
    {
      noteId: `pv-${pitch}-${t}`,
      ctxTime: t,
      pitch,
      velocity,
      durationSec: dur,
      noteOffTime: t + dur,
      waveform: instrument.params.waveform,
      adsr: instrument.params,
      pan: track.pan,
      volume: track.volume,
    },
  ]);
}
