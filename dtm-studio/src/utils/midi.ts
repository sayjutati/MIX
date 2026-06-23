import { makeNote, makeTrack, type MidiNote, type Project } from "../types/project";

export const TICKS_PER_QUARTER = 480;

type MidiEvent = { tick: number; data: number[] };

const writeVarLen = (value: number): number[] => {
  const bytes: number[] = [];
  let v = value >>> 0;
  bytes.unshift(v & 0x7f);
  v >>>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  return bytes;
};

const readVarLen = (data: Uint8Array, offset: number): { value: number; next: number } => {
  let value = 0;
  let i = offset;
  while (i < data.length) {
    const b = data[i++];
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) break;
  }
  return { value, next: i };
};

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];

const buildTrackChunk = (events: MidiEvent[]): Uint8Array => {
  const sorted = [...events].sort((a, b) => a.tick - b.tick);
  const body: number[] = [];
  let prevTick = 0;
  for (const ev of sorted) {
    body.push(...writeVarLen(ev.tick - prevTick));
    body.push(...ev.data);
    prevTick = ev.tick;
  }
  body.push(...writeVarLen(0), 0xff, 0x2f, 0x00);
  const header = [0x4d, 0x54, 0x72, 0x6b, ...u32(body.length)];
  return new Uint8Array([...header, ...body]);
};

const tempoMeta = (bpm: number): MidiEvent => ({
  tick: 0,
  data: [
    0xff,
    0x51,
    0x03,
    (60000000 / bpm) >>> 16,
    ((60000000 / bpm) >>> 8) & 0xff,
    (60000000 / bpm) & 0xff,
  ],
});

const timeSigMeta = (num: number, den: number): MidiEvent => ({
  tick: 0,
  data: [0xff, 0x58, 0x04, num, Math.log2(den) | 0, 24, 8],
});

/** プロジェクト → Standard MIDI File (format 1) */
export const projectToMidi = (project: Project): Uint8Array => {
  const tracks: Uint8Array[] = [];
  const conductor: MidiEvent[] = [
    tempoMeta(project.tempo),
    timeSigMeta(project.timeSignature.numerator, project.timeSignature.denominator),
  ];
  tracks.push(buildTrackChunk(conductor));

  for (const track of project.tracks) {
    const events: MidiEvent[] = [];
    for (const note of track.notes) {
      const startTick = Math.round(note.start * TICKS_PER_QUARTER);
      const endTick = Math.round((note.start + note.duration) * TICKS_PER_QUARTER);
      const vel = Math.max(1, Math.min(127, note.velocity));
      events.push({ tick: startTick, data: [0x90, note.pitch & 0x7f, vel] });
      events.push({ tick: endTick, data: [0x80, note.pitch & 0x7f, 0] });
    }
    tracks.push(buildTrackChunk(events));
  }

  const header = new Uint8Array([
    0x4d,
    0x54,
    0x68,
    0x64,
    ...u32(6),
    ...u16(1),
    ...u16(tracks.length),
    ...u16(TICKS_PER_QUARTER),
  ]);

  const total = header.length + tracks.reduce((s, t) => s + t.length, 0);
  const out = new Uint8Array(total);
  out.set(header, 0);
  let off = header.length;
  for (const t of tracks) {
    out.set(t, off);
    off += t.length;
  }
  return out;
};

type ParsedNote = { pitch: number; startTick: number; endTick: number; velocity: number };

const parseTrackNotes = (
  data: Uint8Array,
  trackOffset: number,
  trackLen: number
): { notes: ParsedNote[]; tempo: number | null } => {
  const notes: ParsedNote[] = [];
  const active = new Map<number, { startTick: number; velocity: number }>();
  let tick = 0;
  let tempo: number | null = null;
  let runningStatus = 0;
  let i = trackOffset;
  const end = trackOffset + trackLen;

  while (i < end) {
    const { value: delta, next } = readVarLen(data, i);
    tick += delta;
    i = next;
    if (i >= end) break;

    const status = data[i];
    if (status === 0xff) {
      const type = data[i + 1];
      const len = data[i + 2];
      if (type === 0x51 && len === 3) {
        const us = (data[i + 3] << 16) | (data[i + 4] << 8) | data[i + 5];
        tempo = 60000000 / us;
      }
      i += 3 + len;
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      const { value: len, next: n } = readVarLen(data, i + 1);
      i = n + len;
      continue;
    }

    let cmd = status;
    if (status < 0x80) {
      cmd = runningStatus;
    } else {
      runningStatus = status;
      i++;
    }

    const ch = cmd & 0xf0;
    if (ch === 0x90) {
      const pitch = data[i];
      const vel = data[i + 1];
      i += 2;
      if (vel === 0) {
        const prev = active.get(pitch);
        if (prev) {
          notes.push({ pitch, startTick: prev.startTick, endTick: tick, velocity: prev.velocity });
          active.delete(pitch);
        }
      } else {
        active.set(pitch, { startTick: tick, velocity: vel });
      }
    } else if (ch === 0x80) {
      const pitch = data[i];
      i += 2;
      const prev = active.get(pitch);
      if (prev) {
        notes.push({ pitch, startTick: prev.startTick, endTick: tick, velocity: prev.velocity });
        active.delete(pitch);
      }
    } else if (ch === 0xa0 || ch === 0xb0 || ch === 0xe0) {
      i += 2;
    } else if (ch === 0xc0 || ch === 0xd0) {
      i += 1;
    } else {
      i++;
    }
  }

  for (const [pitch, prev] of active) {
    notes.push({ pitch, startTick: prev.startTick, endTick: tick, velocity: prev.velocity });
  }

  return { notes, tempo };
};

/** SMF → ノート配列（全トラック統合）+ テンポ */
export const parseMidi = (
  bytes: Uint8Array
): { tempo: number; notes: Omit<MidiNote, "id">[] } => {
  if (bytes.length < 14) throw new Error("Invalid MIDI file");

  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== "MThd") throw new Error("Not a MIDI file");

  const numTracks = (bytes[10] << 8) | bytes[11];
  const ticksPerQuarter = (bytes[12] << 8) | bytes[13];

  let tempo = 120;
  const allNotes: ParsedNote[] = [];
  let offset = 14;

  for (let t = 0; t < numTracks; t++) {
    if (offset + 8 > bytes.length) break;
    const trackMagic = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    if (trackMagic !== "MTrk") break;
    const trackLen =
      (bytes[offset + 4] << 24) |
      (bytes[offset + 5] << 16) |
      (bytes[offset + 6] << 8) |
      bytes[offset + 7];
    const { notes, tempo: trackTempo } = parseTrackNotes(bytes, offset + 8, trackLen);
    if (trackTempo != null) tempo = trackTempo;
    allNotes.push(...notes);
    offset += 8 + trackLen;
  }

  const notes = allNotes
    .filter((n) => n.endTick > n.startTick)
    .map((n) => ({
      pitch: n.pitch,
      start: n.startTick / ticksPerQuarter,
      duration: Math.max(0.0625, (n.endTick - n.startTick) / ticksPerQuarter),
      velocity: n.velocity,
    }))
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);

  return { tempo, notes };
};

/** 選択トラックに MIDI ノートをマージ（既存ノートは保持） */
export const mergeMidiIntoProject = (
  project: Project,
  trackId: string,
  parsed: { tempo: number; notes: Omit<MidiNote, "id">[] }
): Project => ({
  ...project,
  tempo: parsed.tempo,
  updatedAt: Date.now(),
  tracks: project.tracks.map((t) =>
    t.id === trackId
      ? {
          ...t,
          notes: [...t.notes, ...parsed.notes.map((n) => makeNote(n))],
        }
      : t
  ),
});

/** 新規トラックとして MIDI をインポート */
export const importMidiAsNewTrack = (
  project: Project,
  parsed: { tempo: number; notes: Omit<MidiNote, "id">[] },
  trackName = "Imported"
): Project => {
  const track = makeTrack({
    name: trackName,
    notes: parsed.notes.map((n) => makeNote(n)),
  });
  return {
    ...project,
    tempo: parsed.tempo,
    updatedAt: Date.now(),
    tracks: [...project.tracks, track],
  };
};

export const midiFilename = (name: string) =>
  name.replace(/[^\w\u3040-\u30ff\u3400-\u9fff-]+/g, "_").slice(0, 64) || "sequence";
