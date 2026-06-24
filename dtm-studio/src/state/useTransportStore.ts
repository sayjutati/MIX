import { create } from "zustand";

type TransportState = {
  playing: boolean;
  playheadBeat: number;
  loopEnabled: boolean;
  showBarsBeats: boolean;
  setPlaying: (v: boolean) => void;
  setPlayheadBeat: (beat: number) => void;
  setLoopEnabled: (v: boolean) => void;
  setShowBarsBeats: (v: boolean) => void;
};

export const useTransportStore = create<TransportState>((set) => ({
  playing: false,
  playheadBeat: 0,
  loopEnabled: false,
  showBarsBeats: false,
  setPlaying: (playing) => set({ playing }),
  setPlayheadBeat: (playheadBeat) => set({ playheadBeat }),
  setLoopEnabled: (loopEnabled) => set({ loopEnabled }),
  setShowBarsBeats: (showBarsBeats) => set({ showBarsBeats }),
}));
