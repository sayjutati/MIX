import { create } from "zustand";
import type { Project } from "../types/project";
import { useProjectStore } from "./useProjectStore";

export type HistorySnapshot = {
  project: Project;
  selectedTrackId: string | null;
  selectedNoteIds: string[];
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const capture = (): HistorySnapshot => {
  const { project, selectedTrackId, selectedNoteIds } = useProjectStore.getState();
  return {
    project: clone(project),
    selectedTrackId,
    selectedNoteIds: [...selectedNoteIds],
  };
};

const restore = (snap: HistorySnapshot) => {
  useProjectStore.setState({
    project: clone(snap.project),
    selectedTrackId: snap.selectedTrackId,
    selectedNoteIds: new Set(snap.selectedNoteIds),
  });
};

type HistoryState = {
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],

  pushHistory: () => {
    const snap = capture();
    set((s) => {
      const last = s.undoStack[s.undoStack.length - 1];
      if (last && JSON.stringify(last) === JSON.stringify(snap)) return s;
      return {
        undoStack: [...s.undoStack.slice(-49), snap],
        redoStack: [],
      };
    });
  },

  undo: () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1]!;
    const current = capture();
    restore(prev);
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...get().redoStack, current],
    });
  },

  redo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1]!;
    const current = capture();
    restore(next);
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...get().undoStack, current],
    });
  },

  clear: () => set({ undoStack: [], redoStack: [] }),

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
}));
