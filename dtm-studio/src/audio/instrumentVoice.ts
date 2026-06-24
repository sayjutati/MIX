import type { Instrument, SynthParams, Waveform } from "../types/project";
import { resolveDrumVoice } from "./drumMap";

export type ResolvedVoice = {
  pitch: number;
  waveform: Waveform;
  adsr: Pick<SynthParams, "attack" | "decay" | "sustain" | "release">;
};

export const instrumentEngine = (inst: Instrument): "synth" | "drum" =>
  inst.engine ?? "synth";

export const resolveVoiceParams = (inst: Instrument, notePitch: number): ResolvedVoice => {
  if (instrumentEngine(inst) === "drum") {
    const drum = resolveDrumVoice(notePitch);
    return { pitch: drum.pitch, waveform: drum.waveform, adsr: drum.adsr };
  }
  return {
    pitch: notePitch,
    waveform: inst.params.waveform,
    adsr: inst.params,
  };
};
