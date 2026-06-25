import { create } from "zustand";
import type { MidiNote } from "../types/project";
import type { QuantizeGrid } from "../utils/quantize";

export type ToolMode = "select" | "draw";

type EditorState = {
  quantizeGrid: QuantizeGrid;
  stepRecord: boolean;
  snapEnabled: boolean;
  beatZoom: number;
  pitchZoom: number;
  toolMode: ToolMode;
  metronomeOn: boolean;
  noteClipboard: MidiNote[] | null;
  overlayTrackIds: Set<string>;
  setQuantizeGrid: (grid: QuantizeGrid) => void;
  setStepRecord: (on: boolean) => void;
  setSnapEnabled: (on: boolean) => void;
  setBeatZoom: (zoom: number) => void;
  setPitchZoom: (zoom: number) => void;
  setToolMode: (mode: ToolMode) => void;
  setMetronomeOn: (on: boolean) => void;
  setNoteClipboard: (notes: MidiNote[] | null) => void;
  toggleOverlayTrack: (trackId: string) => void;
  setOverlayTracks: (trackIds: string[]) => void;
  clearOverlayTracks: () => void;
};

export const useEditorStore = create<EditorState>((set) => ({
  quantizeGrid: 0.25,
  stepRecord: true,
  snapEnabled: true,
  beatZoom: 1,
  pitchZoom: 1,
  toolMode: "select",
  metronomeOn: false,
  noteClipboard: null,
  overlayTrackIds: new Set(),

  setQuantizeGrid: (quantizeGrid) => set({ quantizeGrid }),
  setStepRecord: (stepRecord) => set({ stepRecord }),
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  setBeatZoom: (beatZoom) => set({ beatZoom: Math.max(0.5, Math.min(2.5, beatZoom)) }),
  setPitchZoom: (pitchZoom) => set({ pitchZoom: Math.max(0.6, Math.min(2, pitchZoom)) }),
  setToolMode: (toolMode) => set({ toolMode }),
  setMetronomeOn: (metronomeOn) => set({ metronomeOn }),
  setNoteClipboard: (noteClipboard) => set({ noteClipboard }),

  toggleOverlayTrack: (trackId) =>
    set((s) => {
      const next = new Set(s.overlayTrackIds);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return { overlayTrackIds: next };
    }),

  setOverlayTracks: (trackIds) => set({ overlayTrackIds: new Set(trackIds) }),

  clearOverlayTracks: () => set({ overlayTrackIds: new Set() }),
}));
