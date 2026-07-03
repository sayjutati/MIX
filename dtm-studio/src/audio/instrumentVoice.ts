import type { Instrument, SynthParams, Waveform } from "../types/project";
import type { DrumKind } from "./oscCore";
import { fixedDrumVoice, resolveDrumVoice } from "./drumMap";
import { patchForKind, type VoicePatch } from "./voicePatch";

export type ResolvedVoice = {
  pitch: number;
  waveform: Waveform;
  adsr: Pick<SynthParams, "attack" | "decay" | "sustain" | "release">;
  drumKind?: DrumKind;
  patch?: VoicePatch;
  sampleId?: string;
};

export const instrumentEngine = (inst: Instrument): "synth" | "drum" =>
  inst.engine ?? "synth";

export const resolveVoiceParams = (inst: Instrument, notePitch: number): ResolvedVoice => {
  if (instrumentEngine(inst) === "drum") {
    const drum = fixedDrumVoice(inst.kind) ?? resolveDrumVoice(notePitch);
    return {
      pitch: drum.pitch,
      waveform: drum.waveform,
      adsr: drum.adsr,
      drumKind: drum.drumKind,
    };
  }
  if (inst.kind === "voice" && inst.sampleAssetId) {
    return {
      pitch: notePitch,
      waveform: "sine",
      adsr: inst.params,
      sampleId: inst.sampleAssetId,
    };
  }
  const patch = patchForKind(inst.kind);
  return {
    pitch: notePitch,
    waveform: inst.params.waveform,
    adsr: inst.params,
    ...(patch ? { patch } : {}),
  };
};
