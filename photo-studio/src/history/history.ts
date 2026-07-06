import type { PhotoProject } from "../types/document";

export type HistoryStack = {
  undo: PhotoProject[];
  redo: PhotoProject[];
};

const MAX = 40;

export const createHistory = (): HistoryStack => ({ undo: [], redo: [] });

export const pushHistory = (hist: HistoryStack, snapshot: PhotoProject): HistoryStack => ({
  undo: [...hist.undo.slice(-MAX + 1), structuredClone(snapshot)],
  redo: [],
});

export const undo = (
  hist: HistoryStack,
  current: PhotoProject
): { hist: HistoryStack; state: PhotoProject } | null => {
  if (!hist.undo.length) return null;
  const prev = hist.undo[hist.undo.length - 1]!;
  return {
    hist: {
      undo: hist.undo.slice(0, -1),
      redo: [...hist.redo, structuredClone(current)],
    },
    state: structuredClone(prev),
  };
};

export const redo = (
  hist: HistoryStack,
  current: PhotoProject
): { hist: HistoryStack; state: PhotoProject } | null => {
  if (!hist.redo.length) return null;
  const next = hist.redo[hist.redo.length - 1]!;
  return {
    hist: {
      undo: [...hist.undo, structuredClone(current)],
      redo: hist.redo.slice(0, -1),
    },
    state: structuredClone(next),
  };
};
