import { create } from "zustand";
import type { QuantizeGrid } from "../utils/quantize";

type EditorState = {
  quantizeGrid: QuantizeGrid;
  setQuantizeGrid: (grid: QuantizeGrid) => void;
};

export const useEditorStore = create<EditorState>((set) => ({
  quantizeGrid: 0.25,
  setQuantizeGrid: (quantizeGrid) => set({ quantizeGrid }),
}));
