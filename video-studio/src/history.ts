import type { EditorState } from "./types";

const MAX_HISTORY = 50;

export interface HistoryStack {
  past: EditorState[];
  future: EditorState[];
}

export const createHistory = (): HistoryStack => ({ past: [], future: [] });

const cloneState = (s: EditorState): EditorState =>
  structuredClone(s);

export const pushHistory = (hist: HistoryStack, state: EditorState): HistoryStack => {
  const past = [...hist.past, cloneState(state)].slice(-MAX_HISTORY);
  return { past, future: [] };
};

export const undo = (
  hist: HistoryStack,
  current: EditorState
): { hist: HistoryStack; state: EditorState } | null => {
  if (hist.past.length === 0) return null;
  const past = [...hist.past];
  const prev = past.pop()!;
  return {
    hist: { past, future: [cloneState(current), ...hist.future] },
    state: prev,
  };
};

export const redo = (
  hist: HistoryStack,
  current: EditorState
): { hist: HistoryStack; state: EditorState } | null => {
  if (hist.future.length === 0) return null;
  const future = [...hist.future];
  const next = future.shift()!;
  return {
    hist: { past: [...hist.past, cloneState(current)], future },
    state: next,
  };
};
