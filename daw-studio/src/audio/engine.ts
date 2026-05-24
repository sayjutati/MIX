import type { Track } from "../types";
import {
  applyTrackEffectParams,
  createTrackEffectChain,
  type TrackEffectNodes,
} from "./chain";

export type TrackStateRef = {
  getTrack: () => Track;
  isAudible: () => boolean;
};

type Runtime = {
  id: number;
  buffer: AudioBuffer | null;
  nodes: TrackEffectNodes | null;
  source: AudioBufferSourceNode | null;
  state: TrackStateRef;
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly runtimes = new Map<number, Runtime>();
  private playing = false;
  private anchorGlobalTime = 0;
  private getGlobalTime: (() => number) | null = null;

  /** UIトランスポートの現在時刻を参照（遅延デコード・シーク後の同期用） */
  setGlobalTimeProvider(fn: () => number) {
    this.getGlobalTime = fn;
  }

  private currentGlobalTime() {
    return this.getGlobalTime?.() ?? this.anchorGlobalTime;
  }

  private createContext() {
    return new AudioContext({ latencyHint: "playback" });
  }

  getContext(): { ctx: AudioContext; master: GainNode } {
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = this.createContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._masterVolume;
      this.master.connect(this.ctx.destination);
    }
    return { ctx: this.ctx, master: this.master! };
  }

  private _masterVolume = 1;

  setMasterVolume(value: number) {
    this._masterVolume = value;
    if (this.master) this.master.gain.value = value;
  }

  async ensureRunning() {
    const { ctx } = this.getContext();
    if (ctx.state === "suspended") await ctx.resume();
  }

  register(id: number, state: TrackStateRef) {
    const existing = this.runtimes.get(id);
    this.runtimes.set(id, {
      id,
      buffer: existing?.buffer ?? null,
      nodes: existing?.nodes ?? null,
      source: existing?.source ?? null,
      state,
    });
  }

  unregister(id: number) {
    this.stopRuntimeSource(this.runtimes.get(id));
    this.runtimes.delete(id);
  }

  setTrackBuffer(id: number, buffer: AudioBuffer) {
    const rt = this.runtimes.get(id);
    if (!rt) return;

    this.stopRuntimeSource(rt);
    rt.buffer = buffer;

    const { ctx, master } = this.getContext();
    if (rt.nodes) {
      try {
        rt.nodes.input.disconnect();
      } catch {
        /* noop */
      }
    }
    rt.nodes = createTrackEffectChain(ctx, master, rt.state.getTrack());

    if (this.playing) {
      this.syncTrack(rt, this.currentGlobalTime(), this.ctx!.currentTime + 0.02);
    }
  }

  updateTrackEffects(id: number) {
    const rt = this.runtimes.get(id);
    if (!rt?.nodes) return;
    applyTrackEffectParams(this.getContext().ctx, rt.nodes, rt.state.getTrack());
  }

  setTrackVolume(id: number, volume: number) {
    const rt = this.runtimes.get(id);
    if (rt?.nodes) rt.nodes.outGain.gain.value = volume;
  }

  getEffectNodes(id: number): TrackEffectNodes | null {
    return this.runtimes.get(id)?.nodes ?? null;
  }

  private stopRuntimeSource(rt: Runtime | undefined) {
    if (!rt?.source) return;
    try {
      rt.source.onended = null;
      rt.source.stop();
      rt.source.disconnect();
    } catch {
      /* noop */
    }
    rt.source = null;
  }

  private stopAllSources() {
    for (const rt of this.runtimes.values()) {
      this.stopRuntimeSource(rt);
    }
  }

  private startRuntimeSource(rt: Runtime, localTime: number, when: number) {
    if (!rt.buffer || !rt.nodes) return;
    const track = rt.state.getTrack();
    const speed = track.speed;

    this.stopRuntimeSource(rt);

    const bufferOffset = Math.max(0, localTime * speed);
    const remain = rt.buffer.duration - bufferOffset;
    if (remain <= 0) return;

    const src = this.getContext().ctx.createBufferSource();
    src.buffer = rt.buffer;
    src.playbackRate.value = speed;
    src.connect(rt.nodes.input);
    src.onended = () => {
      if (rt.source === src) rt.source = null;
    };

    try {
      src.start(when, bufferOffset, remain);
      rt.source = src;
    } catch {
      src.disconnect();
    }
  }

  private syncTrack(rt: Runtime, globalTime: number, ctxTime: number) {
    if (!rt.buffer || !rt.nodes) return;

    if (!rt.state.isAudible()) {
      this.stopRuntimeSource(rt);
      return;
    }

    const track = rt.state.getTrack();
    const duration = track.duration || rt.buffer.duration / track.speed;
    const local = globalTime - track.offset;

    if (duration > 0 && local >= 0 && local < duration) {
      if (!rt.source) {
        this.startRuntimeSource(rt, local, ctxTime);
      }
    } else {
      this.stopRuntimeSource(rt);
    }
  }

  private syncAllSources(globalTime: number, ctxTime: number) {
    for (const rt of this.runtimes.values()) {
      this.syncTrack(rt, globalTime, ctxTime);
    }
  }

  async play(fromGlobalTime: number) {
    await this.ensureRunning();
    const { ctx } = this.getContext();

    this.stopAllSources();
    this.anchorGlobalTime = fromGlobalTime;
    this.playing = true;

    this.syncAllSources(fromGlobalTime, ctx.currentTime + 0.02);
  }

  stop() {
    this.playing = false;
    this.stopAllSources();
  }

  seek(globalTime: number) {
    this.anchorGlobalTime = globalTime;
    this.stopAllSources();
    if (this.playing && this.ctx) {
      this.syncAllSources(globalTime, this.ctx.currentTime + 0.02);
    }
  }

  restartIfPlaying(id: number) {
    if (!this.playing || !this.ctx) return;
    const rt = this.runtimes.get(id);
    if (!rt) return;
    this.stopRuntimeSource(rt);
    this.syncTrack(rt, this.currentGlobalTime(), this.ctx.currentTime + 0.02);
  }

  getIsPlaying() {
    return this.playing;
  }
}

export const audioEngine = new AudioEngine();
