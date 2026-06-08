import type { Clip, PitchNote, Track } from "../types";
import { clipEffectiveOffset } from "../types";
import {
  applyTrackEffectParams,
  computeFadeGain,
  createTrackEffectChain,
  type TrackEffectNodes,
} from "./chain";
import {
  createPitchNode,
  ensurePitchWorklet,
  notesNeedWorklet,
  resetPitchNode,
  sendPitchConfig,
} from "./pitchWorklet";

export type TrackStateRef = {
  getTrack: () => Track;
  isAudible: () => boolean;
};

type ClipRuntime = {
  buffer: AudioBuffer | null;
  originalBuffer: AudioBuffer | null;
  pitchNotes: PitchNote[] | null;
  source: AudioBufferSourceNode | null;
  pitchNode: AudioWorkletNode | null;
  gain: GainNode | null;
};

type Runtime = {
  id: number;
  nodes: TrackEffectNodes | null;
  clips: Map<number, ClipRuntime>;
  state: TrackStateRef;
};

const START_LOOKAHEAD = 0.012;

/** クリップ用ゲインにフェードイン/アウトをスケジュール */
const scheduleClipFade = (
  gain: GainNode,
  track: Track,
  localTime: number,
  playDur: number,
  when: number
) => {
  const g = gain.gain;
  g.cancelScheduledValues(0);
  const startVal = computeFadeGain(track, localTime, playDur);
  g.setValueAtTime(startVal, when);

  if (track.fadeIn > 0 && localTime < track.fadeIn) {
    g.linearRampToValueAtTime(1, when + (track.fadeIn - localTime));
  }
  if (track.fadeOut > 0) {
    const foStart = playDur - track.fadeOut;
    if (localTime < foStart) {
      g.setValueAtTime(1, when + (foStart - localTime));
    }
    g.linearRampToValueAtTime(0, when + Math.max(0, playDur - localTime));
  }
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly runtimes = new Map<number, Runtime>();
  private playing = false;
  private anchorGlobalTime = 0;
  private anchorCtxTime = 0;
  private getGlobalTime: (() => number) | null = null;

  private monitorSource: MediaStreamAudioSourceNode | null = null;
  private monitorGain: GainNode | null = null;

  setGlobalTimeProvider(fn: () => number) {
    this.getGlobalTime = fn;
  }

  private currentGlobalTime() {
    if (this.playing && this.ctx) {
      return this.anchorGlobalTime + (this.ctx.currentTime - this.anchorCtxTime);
    }
    return this.getGlobalTime?.() ?? this.anchorGlobalTime;
  }

  getTransportTime(): number {
    return this.currentGlobalTime();
  }

  private createContext() {
    return new AudioContext({ latencyHint: "playback" });
  }

  private analyser: AnalyserNode | null = null;
  private analyserBuf: Float32Array | null = null;
  private limiter: DynamicsCompressorNode | null = null;

  getContext(): { ctx: AudioContext; master: GainNode } {
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = this.createContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._masterVolume;

      // マスターリミッター：音割れ（クリップ）を防ぐ最終段
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -1;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.1;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyserBuf = new Float32Array(this.analyser.fftSize);

      this.master.connect(this.limiter);
      this.limiter.connect(this.analyser);
      this.limiter.connect(this.ctx.destination);
    }
    return { ctx: this.ctx, master: this.master! };
  }

  /** 出力レイテンシ（秒）の概算。録音の自動補正に使う。 */
  getOutputLatencySec(): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const base = ctx.baseLatency || 0;
    const out = (ctx as AudioContext & { outputLatency?: number }).outputLatency || 0;
    return base + out;
  }

  /** マスター出力のピークレベル（0〜1） */
  getLevel(): number {
    if (!this.analyser || !this.analyserBuf) return 0;
    this.analyser.getFloatTimeDomainData(this.analyserBuf);
    let peak = 0;
    for (let i = 0; i < this.analyserBuf.length; i++) {
      const v = Math.abs(this.analyserBuf[i]);
      if (v > peak) peak = v;
    }
    return Math.min(1, peak);
  }

  private _masterVolume = 1;
  private _pitchLimit = 2;

  setGlobalPitchLimit(n: number) {
    this._pitchLimit = n;
  }

  setMasterVolume(value: number) {
    this._masterVolume = value;
    if (this.master) this.master.gain.value = value;
  }

  async ensureRunning() {
    const { ctx } = this.getContext();
    if (ctx.state === "suspended") await ctx.resume();
    await ensurePitchWorklet(ctx);
  }

  register(id: number, state: TrackStateRef) {
    const existing = this.runtimes.get(id);
    if (existing) {
      existing.state = state;
      return;
    }
    this.runtimes.set(id, {
      id,
      nodes: null,
      clips: new Map(),
      state,
    });
  }

  unregister(id: number) {
    const rt = this.runtimes.get(id);
    if (!rt) return;
    for (const clipRt of rt.clips.values()) this.stopClipSource(clipRt);
    if (rt.nodes) {
      try {
        rt.nodes.input.disconnect();
      } catch {
        /* noop */
      }
    }
    this.runtimes.delete(id);
  }

  private ensureNodes(rt: Runtime) {
    if (rt.nodes) return;
    const { ctx, master } = this.getContext();
    rt.nodes = createTrackEffectChain(ctx, master, rt.state.getTrack());
  }

  setClipBuffer(
    trackId: number,
    clipId: number,
    buffer: AudioBuffer,
    opts?: { original?: AudioBuffer | null; notes?: PitchNote[] }
  ) {
    const rt = this.runtimes.get(trackId);
    if (!rt) return;
    this.ensureNodes(rt);

    let clipRt = rt.clips.get(clipId);
    if (!clipRt) {
      clipRt = {
        buffer: null,
        originalBuffer: null,
        pitchNotes: null,
        source: null,
        pitchNode: null,
        gain: null,
      };
      rt.clips.set(clipId, clipRt);
    }
    this.stopClipSource(clipRt);
    clipRt.buffer = buffer;
    clipRt.originalBuffer = opts?.original ?? null;
    clipRt.pitchNotes = opts?.notes ?? null;

    if (this.playing && this.ctx) {
      this.syncTrack(rt, this.currentGlobalTime(), this.ctx.currentTime + START_LOOKAHEAD);
    }
  }

  /** ピッチノート更新（編集中のリアルタイム試聴） */
  setClipPitch(trackId: number, clipId: number, notes: PitchNote[] | undefined) {
    const rt = this.runtimes.get(trackId);
    const clipRt = rt?.clips.get(clipId);
    if (!rt || !clipRt) return;
    const prev = notesNeedWorklet(clipRt.pitchNotes ?? undefined);
    clipRt.pitchNotes = notes ?? null;
    const next = notesNeedWorklet(notes);

    if (clipRt.pitchNode && notes) {
      const track = rt.state.getTrack();
      const clip = track.clips.find((c) => c.id === clipId);
      const speed = track.speed || 1;
      let localSec = 0;
      if (clip && this.playing) {
        localSec = Math.max(0, this.currentGlobalTime() - clip.offset);
      }
      sendPitchConfig(clipRt.pitchNode, {
        notes,
        limit: this._pitchLimit,
        speed,
        localTime: localSec,
      });
      resetPitchNode(clipRt.pitchNode, localSec, speed);
    }

    if (prev !== next) this.restartIfPlaying(trackId);
  }

  removeClip(trackId: number, clipId: number) {
    const rt = this.runtimes.get(trackId);
    const clipRt = rt?.clips.get(clipId);
    if (!rt || !clipRt) return;
    this.stopClipSource(clipRt);
    rt.clips.delete(clipId);
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

  private stopClipSource(clipRt: ClipRuntime | undefined) {
    if (!clipRt) return;
    if (clipRt.source) {
      try {
        clipRt.source.onended = null;
        clipRt.source.stop();
        clipRt.source.disconnect();
      } catch {
        /* noop */
      }
      clipRt.source = null;
    }
    if (clipRt.pitchNode) {
      try {
        clipRt.pitchNode.disconnect();
        clipRt.pitchNode.port.close();
      } catch {
        /* noop */
      }
      clipRt.pitchNode = null;
    }
    if (clipRt.gain) {
      try {
        clipRt.gain.disconnect();
      } catch {
        /* noop */
      }
      clipRt.gain = null;
    }
  }

  private stopAllSources() {
    for (const rt of this.runtimes.values()) {
      for (const clipRt of rt.clips.values()) this.stopClipSource(clipRt);
    }
  }

  private startClipSource(
    rt: Runtime,
    clip: Clip,
    clipRt: ClipRuntime,
    localTime: number,
    when: number
  ) {
    if (!clipRt.buffer || !rt.nodes) return;
    const track = rt.state.getTrack();
    const speed = track.speed || 1;
    const notes = clipRt.pitchNotes ?? clip.notes;
    const usePitch = notesNeedWorklet(notes);
    const playBuf =
      usePitch && clipRt.originalBuffer ? clipRt.originalBuffer : clipRt.buffer;

    this.stopClipSource(clipRt);

    const bufferOffset = Math.max(0, localTime * speed);
    const remain = playBuf.duration - bufferOffset;
    if (remain <= 0.001) return;

    const { ctx } = this.getContext();
    const src = ctx.createBufferSource();
    src.buffer = playBuf;
    src.playbackRate.value = speed;
    src.detune.value = (track.pitch ?? 0) * 100;

    const gain = ctx.createGain();

    if (usePitch && notes) {
      const pitchNode = createPitchNode(ctx);
      sendPitchConfig(pitchNode, {
        notes,
        limit: this._pitchLimit,
        speed,
        localTime: Math.max(0, localTime),
      });
      src.connect(pitchNode);
      pitchNode.connect(gain);
      clipRt.pitchNode = pitchNode;
    } else {
      src.connect(gain);
    }

    gain.connect(rt.nodes.input);

    const playDur = playBuf.duration / speed;
    scheduleClipFade(gain, track, localTime, playDur, when);

    src.onended = () => {
      if (clipRt.source === src) {
        clipRt.source = null;
      }
    };

    try {
      src.start(when, bufferOffset, remain);
      clipRt.source = src;
      clipRt.gain = gain;
    } catch {
      src.disconnect();
      clipRt.pitchNode?.disconnect();
      gain.disconnect();
    }
  }

  /** 再生範囲に入ったクリップを起動（複数クリップ・オフセット対応） */
  private syncTrack(rt: Runtime, globalTime: number, when: number) {
    if (!rt.nodes) return;
    const audible = rt.state.isAudible();
    const track = rt.state.getTrack();

    for (const clip of track.clips) {
      if (clip.muted) continue;
      const clipRt = rt.clips.get(clip.id);
      if (!clipRt || !clipRt.buffer) continue;

      if (!audible) {
        this.stopClipSource(clipRt);
        continue;
      }

      const start = clipEffectiveOffset(track, clip);
      const playDur = clipRt.buffer.duration / (track.speed || 1);
      const local = globalTime - start;

      if (local >= -0.02 && local < playDur) {
        if (!clipRt.source) {
          this.startClipSource(rt, clip, clipRt, Math.max(0, local), when);
        }
      } else {
        this.stopClipSource(clipRt);
      }
    }
  }

  private syncAllSources(globalTime: number, when: number) {
    for (const rt of this.runtimes.values()) {
      this.syncTrack(rt, globalTime, when);
    }
  }

  /** 毎フレーム呼び出し：時刻更新 + 遅れて開始するクリップの起動 */
  tickTransport(): number {
    if (!this.playing || !this.ctx) return this.anchorGlobalTime;
    const t = this.currentGlobalTime();
    const when = this.ctx.currentTime + START_LOOKAHEAD;
    for (const rt of this.runtimes.values()) {
      this.syncTrack(rt, t, when);
    }
    return t;
  }

  async play(fromGlobalTime: number) {
    await this.ensureRunning();
    const { ctx } = this.getContext();

    this.stopAllSources();
    this.anchorGlobalTime = fromGlobalTime;
    this.anchorCtxTime = ctx.currentTime;
    this.playing = true;

    const when = ctx.currentTime + START_LOOKAHEAD;
    this.syncAllSources(fromGlobalTime, when);
  }

  stop() {
    this.playing = false;
    this.stopAllSources();
  }

  seek(globalTime: number) {
    this.anchorGlobalTime = globalTime;
    if (this.ctx) this.anchorCtxTime = this.ctx.currentTime;
    this.stopAllSources();
    if (this.playing && this.ctx) {
      this.syncAllSources(globalTime, this.ctx.currentTime + START_LOOKAHEAD);
    }
  }

  /** speed/pitch/nudge/offset 変更時：該当レーンのクリップを停止して再同期 */
  restartIfPlaying(id: number) {
    if (!this.playing || !this.ctx) return;
    const rt = this.runtimes.get(id);
    if (!rt) return;
    for (const clipRt of rt.clips.values()) this.stopClipSource(clipRt);
    this.syncTrack(rt, this.currentGlobalTime(), this.ctx.currentTime + START_LOOKAHEAD);
  }

  getIsPlaying() {
    return this.playing;
  }

  /** 録音モニター開始：マイク入力を出力へ直結（自分の声を聞く） */
  async startMonitor(stream: MediaStream) {
    await this.ensureRunning();
    const { ctx } = this.getContext();
    this.stopMonitor();
    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = 1;
    source.connect(gain);
    gain.connect(ctx.destination);
    this.monitorSource = source;
    this.monitorGain = gain;
  }

  stopMonitor() {
    if (this.monitorSource) {
      try {
        this.monitorSource.disconnect();
      } catch {
        /* noop */
      }
      this.monitorSource = null;
    }
    if (this.monitorGain) {
      try {
        this.monitorGain.disconnect();
      } catch {
        /* noop */
      }
      this.monitorGain = null;
    }
  }

  setMonitorVolume(value: number) {
    if (this.monitorGain) this.monitorGain.gain.value = value;
  }

  private inputSource: MediaStreamAudioSourceNode | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private inputBuf: Float32Array | null = null;

  /** マイク入力のレベルメーター用にアナライザーを接続（音は出さない） */
  async startInputMeter(stream: MediaStream) {
    await this.ensureRunning();
    const { ctx } = this.getContext();
    this.stopInputMeter();
    this.inputSource = ctx.createMediaStreamSource(stream);
    this.inputAnalyser = ctx.createAnalyser();
    this.inputAnalyser.fftSize = 1024;
    this.inputBuf = new Float32Array(this.inputAnalyser.fftSize);
    this.inputSource.connect(this.inputAnalyser);
  }

  stopInputMeter() {
    if (this.inputSource) {
      try {
        this.inputSource.disconnect();
      } catch {
        /* noop */
      }
      this.inputSource = null;
    }
    this.inputAnalyser = null;
    this.inputBuf = null;
  }

  /** マイク入力のピークレベル（0〜1） */
  getInputLevel(): number {
    if (!this.inputAnalyser || !this.inputBuf) return 0;
    this.inputAnalyser.getFloatTimeDomainData(this.inputBuf);
    let peak = 0;
    for (let i = 0; i < this.inputBuf.length; i++) {
      const v = Math.abs(this.inputBuf[i]);
      if (v > peak) peak = v;
    }
    return Math.min(1, peak);
  }
}

export const audioEngine = new AudioEngine();
