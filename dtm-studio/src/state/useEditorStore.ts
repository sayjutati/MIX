import { create } from "zustand";
import type { QuantizeGrid } from "../utils/quantize";

type EditorState = {
  quantizeGrid: QuantizeGrid;
  stepRecord: boolean;
  /** ピアノロールに重ねて表示するトラック ID（編集トラック以外） */
  overlayTrackIds: Set<string>;
  setQuantizeGrid: (grid: QuantizeGrid) => void;
  setStepRecord: (on: boolean) => void;
  toggleOverlayTrack: (trackId: string) => void;
  setOverlayTracks: (trackIds: string[]) => void;
  clearOverlayTracks: () => void;
};

export const useEditorStore = create<EditorState>((set) => ({
  quantizeGrid: 0.25,
  stepRecord: true,
  overlayTrackIds: new Set(),

  setQuantizeGrid: (quantizeGrid) => set({ quantizeGrid }),
  setStepRecord: (stepRecord) => set({ stepRecord }),

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
