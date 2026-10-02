import type { AudioClip, Project, Track } from "../types/project";
import { beatToSec, isAudioTrack, secToBeat } from "../types/project";
import { decodeAudioUrl } from "./decode";
import { getAudioContext } from "./engine";
import { getAudioAssetUrl } from "../storage/audioAssetStorage";
import { applyTrackFx, createTrackFxChain, type TrackFxNodes } from "./trackFxChain";

type ScheduledSource = {
  source: AudioBufferSourceNode;
  gain: GainNode;
};

type TrackRuntime = {
  chain: TrackFxNodes;
  buffers: Map<string, AudioBuffer>;
};

export type ClipSchedule = {
  scheduleId: string;
  ctxTime: number;
  trackId: string;
  clipId: string;
  offsetSec: number;
  durationSec: number;
  volume: number;
};

export function buildClipSchedules(
  project: Project,
  beatWindowStart: number,
  beatWindowEnd: number,
  anchorCtxTime: number,
  anchorBeat: number,
  tempo: number,
  cycleId = 0
): ClipSchedule[] {
  const hasSolo = project.tracks.some((t) => t.solo);
  const master = project.masterVolume ?? 1;
  const out: ClipSchedule[] = [];

  for (const track of project.tracks) {
    if (!isAudioTrack(track)) continue;
    if (track.muted) continue;
    if (hasSolo && !track.solo) continue;

    for (const clip of track.clips ?? []) {
      const clipEndBeat = clip.startBeat + secToBeat(clip.durationSec, tempo);
      if (clipEndBeat <= beatWindowStart || clip.startBeat >= beatWindowEnd) continue;

      const beatOffset = clip.startBeat - anchorBeat;
      const ctxTime = anchorCtxTime + beatToSec(beatOffset, tempo);
      out.push({
        scheduleId: `${cycleId}:${track.id}:${clip.id}`,
        ctxTime,
        trackId: track.id,
        clipId: clip.id,
        offsetSec: clip.trimStart,
        durationSec: clip.durationSec,
        volume: track.volume * master,
      });
    }
  }
  return out;
}

const MIN_LEAD_SEC = 0.005;

/**
 * 開始予定時刻 ctxTime が過去の場合（途中シーク・デコード待ち）は、
 * 経過した分だけ素材を頭出しして再生位置を保つ。残りが無ければ null。
 */
export function resolveClipTiming(
  now: number,
  s: Pick<ClipSchedule, "ctxTime" | "offsetSec" | "durationSec">
): { when: number; offsetSec: number; durationSec: number } | null {
  const when = Math.max(now + MIN_LEAD_SEC, s.ctxTime);
  const lateSec = Math.max(0, when - s.ctxTime);
  const durationSec = s.durationSec - lateSec;
  if (durationSec <= 0.001) return null;
  return { when, offsetSec: s.offsetSec + lateSec, durationSec };
}

export class AudioClipPlayer {
  /** clearScheduled のたびに進め、await 後に古い schedule() を破棄する */
  private epoch = 0;
  private scheduled = new Set<string>();
  private activeSources = new Map<string, ScheduledSource>();
  private trackRuntimes = new Map<string, TrackRuntime>();
  private masterDest: AudioNode | null = null;

  async ensureGraph(destination: AudioNode) {
    this.masterDest = destination;
    await getAudioContext();
  }

  private async getTrackRuntime(track: Track): Promise<TrackRuntime | null> {
    if (!this.masterDest) return null;
    let rt = this.trackRuntimes.get(track.id);
    if (!rt) {
      const ctx = await getAudioContext();
      const chain = createTrackFxChain(ctx, this.masterDest);
      applyTrackFx(
        chain,
        track.fx ?? { reverb: 0, delay: 0, delayTime: 0.25, eqLow: 0, eqHigh: 0, compressor: 0 },
        track.pan,
        1
      );
      rt = { chain, buffers: new Map() };
      this.trackRuntimes.set(track.id, rt);
    } else {
      applyTrackFx(
        rt.chain,
        track.fx ?? { reverb: 0, delay: 0, delayTime: 0.25, eqLow: 0, eqHigh: 0, compressor: 0 },
        track.pan,
        1
      );
    }
    return rt;
  }

  private async getClipBuffer(clip: AudioClip, rt: TrackRuntime): Promise<AudioBuffer | null> {
    const cached = rt.buffers.get(clip.assetId);
    if (cached) return cached;
    const url = await getAudioAssetUrl(clip.assetId);
    if (!url) return null;
    const ctx = await getAudioContext();
    try {
      const buf = await decodeAudioUrl(url, ctx);
      rt.buffers.set(clip.assetId, buf);
      return buf;
    } catch {
      return null;
    }
  }

  async schedule(project: Project, schedules: ClipSchedule[]) {
    const epoch = this.epoch;
    const ctx = await getAudioContext();
    if (epoch !== this.epoch) return;

    for (const s of schedules) {
      if (this.scheduled.has(s.scheduleId)) continue;
      const track = project.tracks.find((t) => t.id === s.trackId);
      const clip = track?.clips?.find((c) => c.id === s.clipId);
      if (!track || !clip) continue;
      // デコード待ちの間に同じクリップが二重に鳴らないよう先に予約する
      this.scheduled.add(s.scheduleId);

      const rt = await this.getTrackRuntime(track);
      const buffer = rt ? await this.getClipBuffer(clip, rt) : null;
      if (epoch !== this.epoch) return;
      if (!rt || !buffer) {
        this.scheduled.delete(s.scheduleId);
        continue;
      }

      // デコード待ちで開始時刻を過ぎていても、経過分だけ頭出しして位置を保つ
      const timing = resolveClipTiming(ctx.currentTime, s);
      if (!timing) continue;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = s.volume;
      source.connect(gain);
      gain.connect(rt.chain.input);
      source.start(timing.when, timing.offsetSec, timing.durationSec);

      this.activeSources.set(s.scheduleId, { source, gain });
      source.onended = () => {
        this.activeSources.delete(s.scheduleId);
      };
    }
  }

  clearScheduled() {
    this.epoch++;
    this.scheduled.clear();
    for (const { source } of this.activeSources.values()) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    this.activeSources.clear();
  }

  reset() {
    this.clearScheduled();
    this.trackRuntimes.clear();
  }

  invalidateTracks() {
    for (const rt of this.trackRuntimes.values()) {
      rt.buffers.clear();
    }
  }
}

export const audioClipPlayer = new AudioClipPlayer();

export const clipEndBeat = (clip: AudioClip, tempo: number) =>
  clip.startBeat + secToBeat(clip.durationSec, tempo);
