import type { Project } from "../types/project";
import { beatToSec, makeProject, secToBeat } from "../types/project";
import { projectEndBeat } from "./offlineRender";
import {
  audioClipPlayer,
  buildClipSchedules,
} from "./audioClipPlayer";
import {
  buildNoteSchedules,
  initAudioGraph,
  LOOKAHEAD_MS,
  onClockPosition,
  SCHEDULE_AHEAD_SEC,
  scheduleNotesToSynth,
  seekTransport,
  startTransport,
  stopTransport,
  type ClockPosition,
} from "./engine";

let projectGetter: () => Project = () => makeProject();
let loopEnabledGetter: () => boolean = () => false;
let onPlaybackEnd: ((endBeat: number) => void) | null = null;

export function bindSchedulerProject(fn: () => Project) {
  projectGetter = fn;
}

export function bindSchedulerTransport(opts: {
  loopEnabled: () => boolean;
  onEnd: (endBeat: number) => void;
}) {
  loopEnabledGetter = opts.loopEnabled;
  onPlaybackEnd = opts.onEnd;
}

export class LookaheadScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private scheduled = new Set<string>();
  private anchor: ClockPosition & { tempo: number } | null = null;
  private startBeat = 0;
  private loopResyncing = false;
  private loopCycle = 0;
  private unsubClock: (() => void) | null = null;
  private ctxRef: AudioContext | null = null;
  private ended = false;

  private getProject() {
    return projectGetter();
  }

  private resolveNow() {
    if (!this.anchor) return null;
    const ctx = this.ctxRef;
    if (!ctx) {
      return { beat: this.anchor.beat, ctxTime: this.anchor.ctxTime, tempo: this.anchor.tempo };
    }
    const elapsed = Math.max(0, ctx.currentTime - this.anchor.ctxTime);
    const tempo = this.anchor.tempo;
    return {
      beat: this.anchor.beat + (elapsed * tempo) / 60,
      ctxTime: this.anchor.ctxTime + elapsed,
      tempo,
    };
  }

  async start(fromBeat: number) {
    const { ctx, clock, synth } = await initAudioGraph();
    this.ctxRef = ctx;
    await audioClipPlayer.ensureGraph(ctx.destination);
    this.ended = false;
    const project = this.getProject();
    this.startBeat = fromBeat;
    this.loopResyncing = false;
    this.loopCycle = 0;
    this.scheduled.clear();
    synth.port.postMessage({ type: "clearQueue" });
    audioClipPlayer.clearScheduled();

    const baseCtxTime = ctx.currentTime + 0.05;
    this.anchor = { beat: fromBeat, ctxTime: baseCtxTime, tempo: project.tempo };
    startTransport(clock, synth, ctx, fromBeat, project.tempo);

    this.unsubClock?.();
    this.unsubClock = onClockPosition(clock, (pos) => {
      if (!this.anchor) return;
      this.anchor.beat = pos.beat;
      this.anchor.ctxTime = pos.ctxTime;
      this.checkTransportEnd(pos.beat);
    });

    this.intervalId = setInterval(() => void this.tick(), LOOKAHEAD_MS);
    void this.tick();
  }

  private checkTransportEnd(beat: number) {
    if (this.ended) return;
    const project = this.getProject();
    const looping = loopEnabledGetter();

    if (looping) {
      const { loopEnd, loopStart } = project;
      if (loopEnd - loopStart > 0.05 && beat >= loopEnd && !this.loopResyncing) {
        this.loopResyncing = true;
        void this.resyncLoop(loopStart).finally(() => {
          this.loopResyncing = false;
        });
      }
      return;
    }

    const endBeat = projectEndBeat(project);
    if (beat >= endBeat - 1e-4) {
      this.ended = true;
      onPlaybackEnd?.(endBeat);
    }
  }

  private async resyncLoop(beat: number) {
    const { ctx, clock, synth } = await initAudioGraph();
    this.ctxRef = ctx;
    const project = this.getProject();
    this.loopCycle++;
    this.scheduled.clear();
    audioClipPlayer.clearScheduled();
    this.startBeat = beat;
    seekTransport(clock, synth, ctx, beat, project.tempo);
    const baseCtxTime = ctx.currentTime + 0.05;
    this.anchor = { beat, ctxTime: baseCtxTime, tempo: project.tempo };
    void this.tick();
  }

  async syncTempo() {
    if (!this.anchor) return;
    const { ctx, clock, synth } = await initAudioGraph();
    this.ctxRef = ctx;
    const project = this.getProject();
    const now = this.resolveNow();
    const beat = now?.beat ?? this.anchor.beat;
    this.scheduled.clear();
    synth.port.postMessage({ type: "clearQueue" });
    audioClipPlayer.clearScheduled();
    seekTransport(clock, synth, ctx, beat, project.tempo);
    const baseCtxTime = ctx.currentTime + 0.05;
    this.anchor = { beat, ctxTime: baseCtxTime, tempo: project.tempo };
    void this.tick();
  }

  async invalidatePending() {
    if (!this.anchor) return;
    this.scheduled.clear();
    audioClipPlayer.clearScheduled();
    const { synth } = await initAudioGraph();
    synth.port.postMessage({ type: "clearQueue" });
    void this.tick();
  }

  async seek(beat: number) {
    const { ctx, clock, synth } = await initAudioGraph();
    this.ctxRef = ctx;
    const project = this.getProject();
    this.scheduled.clear();
    synth.port.postMessage({ type: "clearQueue" });
    audioClipPlayer.clearScheduled();
    seekTransport(clock, synth, ctx, beat, project.tempo);
    const baseCtxTime = ctx.currentTime + 0.05;
    this.anchor = { beat, ctxTime: baseCtxTime, tempo: project.tempo };
    this.startBeat = beat;
    void this.tick();
  }

  private async tick() {
    if (!this.anchor) return;
    const now = this.resolveNow();
    if (!now) return;

    const { synth } = await initAudioGraph();
    const project = this.getProject();
    const tempo = project.tempo;
    const { loopStart, loopEnd } = project;
    const looping = loopEnabledGetter();
    const nowCtx = now.ctxTime;
    const nowBeat = now.beat;
    const aheadBeat = secToBeat(SCHEDULE_AHEAD_SEC, tempo);
    const winStart = Math.max(0, nowBeat - aheadBeat * 0.25);
    const winEnd = nowBeat + aheadBeat;

    this.checkTransportEnd(nowBeat);

    const notes = buildNoteSchedules(
      project,
      winStart,
      winEnd,
      nowCtx,
      nowBeat,
      tempo,
      this.loopCycle
    ).filter((n) => !this.scheduled.has(n.noteId));

    if (notes.length > 0) {
      scheduleNotesToSynth(synth, notes);
      for (const n of notes) this.scheduled.add(n.noteId);
    }

    const clips = buildClipSchedules(
      project,
      winStart,
      winEnd,
      nowCtx,
      nowBeat,
      tempo,
      this.loopCycle
    ).filter((c) => !this.scheduled.has(c.scheduleId));

    if (clips.length > 0) {
      await audioClipPlayer.schedule(project, clips);
      for (const c of clips) this.scheduled.add(c.scheduleId);
    }

    if (looping && winEnd > loopEnd && loopEnd - loopStart > 0.05) {
      const wrapNotes = buildNoteSchedules(
        project,
        loopStart,
        loopStart + (winEnd - loopEnd),
        nowCtx + beatToSec(loopEnd - nowBeat, tempo),
        loopEnd,
        tempo,
        this.loopCycle + 1
      ).filter((n) => !this.scheduled.has(n.noteId));
      if (wrapNotes.length > 0) {
        scheduleNotesToSynth(synth, wrapNotes);
        for (const n of wrapNotes) this.scheduled.add(n.noteId);
      }
    }
  }

  async stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.unsubClock?.();
    this.unsubClock = null;
    this.anchor = null;
    this.ctxRef = null;
    this.loopResyncing = false;
    this.loopCycle = 0;
    this.ended = false;
    this.scheduled.clear();
    audioClipPlayer.clearScheduled();
    const { clock, synth } = await initAudioGraph();
    stopTransport(clock, synth);
  }

  getPlayheadBeat() {
    return this.resolveNow()?.beat ?? this.anchor?.beat ?? this.startBeat;
  }
}

export const scheduler = new LookaheadScheduler();
