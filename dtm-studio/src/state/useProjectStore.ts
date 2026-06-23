import { create } from "zustand";
import {
  makeNote,
  makeProject,
  makeTrack,
  type MidiNote,
  type Project,
  type Track,
} from "../types/project";
import { snapBeat } from "../utils/quantize";

export const TRACK_COLORS = ["#6c8cff", "#ff6b8a", "#8af0c0", "#ffb86c", "#bd93f9", "#f1fa8c"];

type ProjectState = {
  project: Project;
  selectedTrackId: string | null;
  selectedNoteIds: Set<string>;
  setProject: (p: Project) => void;
  selectTrack: (id: string | null) => void;
  selectNotes: (ids: string[]) => void;
  toggleNoteSelection: (id: string) => void;
  addNote: (trackId: string, note: Omit<MidiNote, "id"> & { id?: string }) => void;
  updateNote: (trackId: string, noteId: string, patch: Partial<MidiNote>) => void;
  updateNotes: (
    trackId: string,
    updates: Array<{ noteId: string; patch: Partial<MidiNote> }>
  ) => void;
  removeNotes: (trackId: string, noteIds: string[]) => void;
  quantizeNotes: (trackId: string, noteIds: string[], grid: number) => void;
  setNotesVelocity: (trackId: string, noteIds: string[], velocity: number) => void;
  setTempo: (tempo: number) => void;
  setLoop: (start: number, end: number) => void;
  addTrack: () => void;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, patch: Partial<Track>) => void;
  touch: () => void;
};

const touchProject = (p: Project): Project => ({ ...p, updatedAt: Date.now() });

export const useProjectStore = create<ProjectState>((set) => ({
  project: makeProject(),
  selectedTrackId: null,
  selectedNoteIds: new Set(),

  setProject: (p) =>
    set({
      project: p,
      selectedTrackId: p.tracks[0]?.id ?? null,
      selectedNoteIds: new Set(),
    }),

  selectTrack: (id) => set({ selectedTrackId: id, selectedNoteIds: new Set() }),

  selectNotes: (ids) => set({ selectedNoteIds: new Set(ids) }),

  toggleNoteSelection: (id) =>
    set((s) => {
      const next = new Set(s.selectedNoteIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedNoteIds: next };
    }),

  addNote: (trackId, note) =>
    set((s) => ({
      project: touchProject({
        ...s.project,
        tracks: s.project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                notes: [
                  ...t.notes,
                  makeNote({
                    pitch: note.pitch,
                    start: note.start,
                    duration: note.duration ?? 1,
                    velocity: note.velocity ?? 100,
                    ...(note.id ? { id: note.id } : {}),
                  }),
                ],
              }
            : t
        ),
      }),
    })),

  updateNote: (trackId, noteId, patch) =>
    set((s) => ({
      project: touchProject({
        ...s.project,
        tracks: s.project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                notes: t.notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
              }
            : t
        ),
      }),
    })),

  updateNotes: (trackId, updates) =>
    set((s) => {
      const patchMap = new Map(updates.map((u) => [u.noteId, u.patch]));
      return {
        project: touchProject({
          ...s.project,
          tracks: s.project.tracks.map((t) =>
            t.id === trackId
              ? {
                  ...t,
                  notes: t.notes.map((n) => {
                    const p = patchMap.get(n.id);
                    return p ? { ...n, ...p } : n;
                  }),
                }
              : t
          ),
        }),
      };
    }),

  removeNotes: (trackId, noteIds) =>
    set((s) => {
      const drop = new Set(noteIds);
      return {
        project: touchProject({
          ...s.project,
          tracks: s.project.tracks.map((t) =>
            t.id === trackId ? { ...t, notes: t.notes.filter((n) => !drop.has(n.id)) } : t
          ),
        }),
        selectedNoteIds: new Set(),
      };
    }),

  quantizeNotes: (trackId, noteIds, grid) =>
    set((s) => {
      const ids = new Set(noteIds);
      return {
        project: touchProject({
          ...s.project,
          tracks: s.project.tracks.map((t) =>
            t.id === trackId
              ? {
                  ...t,
                  notes: t.notes.map((n) =>
                    ids.has(n.id)
                      ? { ...n, start: Math.max(0, snapBeat(n.start, grid)) }
                      : n
                  ),
                }
              : t
          ),
        }),
      };
    }),

  setNotesVelocity: (trackId, noteIds, velocity) =>
    set((s) => {
      const ids = new Set(noteIds);
      const v = Math.max(1, Math.min(127, Math.round(velocity)));
      return {
        project: touchProject({
          ...s.project,
          tracks: s.project.tracks.map((t) =>
            t.id === trackId
              ? {
                  ...t,
                  notes: t.notes.map((n) => (ids.has(n.id) ? { ...n, velocity: v } : n)),
                }
              : t
          ),
        }),
      };
    }),

  setTempo: (tempo) =>
    set((s) => ({
      project: touchProject({ ...s.project, tempo: Math.max(20, Math.min(300, tempo)) }),
    })),

  setLoop: (start, end) =>
    set((s) => ({
      project: touchProject({
        ...s.project,
        loopStart: start,
        loopEnd: Math.max(start + 0.25, end),
      }),
    })),

  addTrack: () =>
    set((s) => {
      const n = s.project.tracks.length + 1;
      const track = makeTrack({
        name: `Track ${n}`,
        color: TRACK_COLORS[(n - 1) % TRACK_COLORS.length],
        instrumentId: s.project.instruments[n % s.project.instruments.length]?.id ?? "inst-basic",
      });
      return {
        project: touchProject({ ...s.project, tracks: [...s.project.tracks, track] }),
        selectedTrackId: track.id,
        selectedNoteIds: new Set(),
      };
    }),

  removeTrack: (trackId) =>
    set((s) => {
      if (s.project.tracks.length <= 1) return s;
      const tracks = s.project.tracks.filter((t) => t.id !== trackId);
      const selectedTrackId =
        s.selectedTrackId === trackId ? tracks[0]?.id ?? null : s.selectedTrackId;
      return {
        project: touchProject({ ...s.project, tracks }),
        selectedTrackId,
        selectedNoteIds: new Set(),
      };
    }),

  updateTrack: (trackId, patch) =>
    set((s) => ({
      project: touchProject({
        ...s.project,
        tracks: s.project.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)),
      }),
    })),

  touch: () => set((s) => ({ project: touchProject(s.project) })),
}));

export const useSelectedTrack = (): Track | null => {
  const project = useProjectStore((s) => s.project);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  return project.tracks.find((t) => t.id === selectedTrackId) ?? project.tracks[0] ?? null;
};

export const useSelectedNotes = (): MidiNote[] => {
  const track = useSelectedTrack();
  const selectedNoteIds = useProjectStore((s) => s.selectedNoteIds);
  if (!track) return [];
  return track.notes.filter((n) => selectedNoteIds.has(n.id));
};
