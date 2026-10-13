import type { Instrument, InstrumentKind, LaneRole, Track } from "../types/project";
import { isAudioTrack } from "../types/project";

export const LANE_ROLES: { id: LaneRole; label: string; hint: string; accent: string }[] = [
  { id: "perc", label: "パーカス", hint: "キック・スネア・シンバルを同じ枠で重ねる", accent: "#ef4444" },
  { id: "bass", label: "ベース", hint: "ベース音源を同じ枠で重ねる", accent: "#22c55e" },
  { id: "melody", label: "メロディ", hint: "鍵盤・シンセを同じ枠で重ねる", accent: "#60a5fa" },
];

const PERC_KINDS = new Set<InstrumentKind>([
  "drumKit",
  "kick",
  "snare",
  "hihat",
  "openhat",
  "clap",
  "tom",
  "crash",
  "ride",
  "perc",
]);
const BASS_KINDS = new Set<InstrumentKind>(["bass", "bass808"]);

export const KIND_COLORS: Partial<Record<InstrumentKind, string>> = {
  kick: "#ef4444",
  snare: "#f59e0b",
  hihat: "#fde047",
  openhat: "#facc15",
  clap: "#fb7185",
  tom: "#fb923c",
  crash: "#a78bfa",
  ride: "#c4b5fd",
  perc: "#f472b6",
  drumKit: "#f87171",
  bass: "#22c55e",
  bass808: "#4ade80",
  piano: "#60a5fa",
  epiano: "#38bdf8",
  organ: "#818cf8",
  guitar: "#f97316",
  flute: "#2dd4bf",
  bell: "#e879f9",
  marimba: "#34d399",
  strings: "#c084fc",
  brass: "#fbbf24",
  lead: "#f472b6",
  pad: "#93c5fd",
  pluck: "#fdba74",
  basic: "#7dd3fc",
  bright: "#67e8f9",
  warm: "#fda4af",
  supersaw: "#e879f9",
  voice: "#f9a8d4",
};

export const roleOfKind = (kind: InstrumentKind | undefined): LaneRole => {
  if (!kind) return "melody";
  if (PERC_KINDS.has(kind)) return "perc";
  if (BASS_KINDS.has(kind)) return "bass";
  return "melody";
};

export const kindsForRole = (role: LaneRole): InstrumentKind[] => {
  const all: InstrumentKind[] = [
    "basic",
    "bright",
    "warm",
    "lead",
    "bass",
    "pad",
    "pluck",
    "organ",
    "piano",
    "epiano",
    "strings",
    "brass",
    "flute",
    "bell",
    "marimba",
    "guitar",
    "bass808",
    "supersaw",
    "drumKit",
    "kick",
    "snare",
    "hihat",
    "openhat",
    "clap",
    "tom",
    "crash",
    "ride",
    "perc",
    "voice",
  ];
  return all.filter((k) => roleOfKind(k) === role && k !== "voice");
};

export const colorForKind = (kind: InstrumentKind | undefined, fallback: string) =>
  (kind && KIND_COLORS[kind]) || fallback;

export const resolveTrackRole = (track: Track, instruments: Instrument[]): LaneRole => {
  if (track.role) return track.role;
  if (isAudioTrack(track)) return "melody";
  const inst = instruments.find((i) => i.id === track.instrumentId);
  return roleOfKind(inst?.kind);
};

export const tracksInRole = (tracks: Track[], instruments: Instrument[], role: LaneRole) =>
  tracks.filter((t) => !isAudioTrack(t) && resolveTrackRole(t, instruments) === role);

export const audioTracks = (tracks: Track[]) => tracks.filter(isAudioTrack);
