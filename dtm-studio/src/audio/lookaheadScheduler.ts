import type { Project } from "../types/project";
import { beatToSec, secToBeat, makeProject } from "../types/project";
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

export function bindSchedulerProject(fn: () => Project) {
  projectGetter = fn;
}

export class LookaheadScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private scheduled = new Set<string>();
  private anchor: ClockPosition & { tempo: number } | null = null;
  private startBeat = 0;
  private looping = true;
  private loopResyncing = false;
  private loopCycle = 0;
  private unsubClock: (() => void) | null = null;

  private getProject() {
    return projectGetter();
  }

  async start(fromBeat: number) {
    const { ctx, clock, synth } = await initAudioGraph();
    const project = this.getProject();
    this.startBeat = fromBeat;
    this.loopResyncing = false;
    this.loopCycle = 0;
    this.scheduled.clear();
    synth.port.postMessage({ type: "clearQueue" });

    const baseCtxTime = ctx.currentTime + 0.05;
    this.anchor = { beat: fromBeat, ctxTime: baseCtxTime, tempo: project.tempo };
    startTransport(clock, synth, ctx, fromBeat, project.tempo);

    this.unsubClock?.();
    this.unsubClock = onClockPosition(clock, (pos) => {
      if (!this.anchor) return;
      this.anchor.beat = pos.beat;
      this.anchor.ctxTime = pos.ctxTime;

      const { loopEnd, loopStart } = this.getProject();
      if (this.looping && pos.beat >= loopEnd && !this.loopResyncing) {
        this.loopResyncing = true;
        void this.resyncLoop(loopStart).finally(() => {
          this.loopResyncing = false;
        });
      }
    });

    this.intervalId = setInterval(() => void this.tick(), LOOKAHEAD_MS);
    void this.tick();
  }

  private async resyncLoop(beat: number) {
    const { ctx, clock, synth } = await initAudioGraph();
    const project = this.getProject();
    this.loopCycle++;
    this.scheduled.clear();
    this.startBeat = beat;
    seekTransport(clock, synth, ctx, beat, project.tempo);
    const baseCtxTime = ctx.currentTime + 0.05;
    this.anchor = { beat, ctxTime: baseCtxTime, tempo: project.tempo };
  }

  async syncTempo() {
    if (!this.anchor) return;
    const { ctx, clock, synth } = await initAudioGraph();
    const project = this.getProject();
    const beat = this.anchor.beat;
    this.scheduled.clear();
    synth.port.postMessage({ type: "clearQueue" });
    seekTransport(clock, synth, ctx, beat, project.tempo);
    const baseCtxTime = ctx.currentTime + 0.05;
    this.anchor = { beat, ctxTime: baseCtxTime, tempo: project.tempo };
  }

  async invalidatePending() {
    if (!this.anchor) return;
    this.scheduled.clear();
    const { synth } = await initAudioGraph();
    synth.port.postMessage({ type: "clearQueue" });
    void this.tick();
  }

  private async tick() {
    if (!this.anchor) return;
    const { synth } = await initAudioGraph();
    const project = this.getProject();
    const tempo = project.tempo;
    const { loopStart, loopEnd } = project;
    const nowCtx = this.anchor.ctxTime;
    const nowBeat = this.anchor.beat;
    const aheadBeat = secToBeat(SCHEDULE_AHEAD_SEC, tempo);
    const winStart = nowBeat;
    const winEnd = nowBeat + aheadBeat;

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

    if (this.looping && winEnd > loopEnd) {
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
    this.loopResyncing = false;
    this.loopCycle = 0;
    this.scheduled.clear();
    const { clock, synth } = await initAudioGraph();
    stopTransport(clock, synth);
  }

  getPlayheadBeat() {
    return this.anchor?.beat ?? this.startBeat;
  }
}

export const scheduler = new LookaheadScheduler();
