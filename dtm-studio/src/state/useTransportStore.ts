import { create } from "zustand";

type TransportState = {
  playing: boolean;
  playheadBeat: number;
  setPlaying: (v: boolean) => void;
  setPlayheadBeat: (beat: number) => void;
};

export const useTransportStore = create<TransportState>((set) => ({
  playing: false,
  playheadBeat: 0,
  setPlaying: (playing) => set({ playing }),
  setPlayheadBeat: (playheadBeat) => set({ playheadBeat }),
}));
