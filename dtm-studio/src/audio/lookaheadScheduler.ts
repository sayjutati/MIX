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

/** 先読みスケジューラ — メインスレッドが currentTime 基準で Worklet へノートを配送 */
let projectGetter: () => Project = () => makeProject();

export function bindSchedulerProject(fn: () => Project) {
  projectGetter = fn;
}

export class LookaheadScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private scheduled = new Set<string>();
  private anchor: ClockPosition & { tempo: number } | null = null;
  private startBeat = 0;
  private loopStart = 0;
  private loopEnd = 16;
  private looping = true;
  private unsubClock: (() => void) | null = null;

  private getProject() {
    return projectGetter();
  }

  async start(fromBeat: number) {
    const { ctx, clock, synth } = await initAudioGraph();
    const project = this.getProject();
    this.startBeat = fromBeat;
    this.loopStart = project.loopStart;
    this.loopEnd = project.loopEnd;
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

      if (this.looping && pos.beat >= this.loopEnd) {
        const nextBeat = this.loopStart;
        this.resyncLoop(nextBeat);
      }
    });

    this.intervalId = setInterval(() => void this.tick(), LOOKAHEAD_MS);
    void this.tick();
  }

  private async resyncLoop(beat: number) {
    const { ctx, clock, synth } = await initAudioGraph();
    const project = this.getProject();
    this.scheduled.clear();
    this.startBeat = beat;
    seekTransport(clock, synth, ctx, beat, project.tempo);
    const baseCtxTime = ctx.currentTime + 0.05;
    this.anchor = { beat, ctxTime: baseCtxTime, tempo: project.tempo };
  }

  private async tick() {
    if (!this.anchor) return;
    const { synth } = await initAudioGraph();
    const project = this.getProject();
    const tempo = project.tempo;
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
      tempo
    ).filter((n) => !this.scheduled.has(n.noteId));

    if (notes.length > 0) {
      scheduleNotesToSynth(synth, notes);
      for (const n of notes) this.scheduled.add(n.noteId);
    }

    // ループ境界を越えたノートも先読み
    if (this.looping && winEnd > this.loopEnd) {
      const wrapNotes = buildNoteSchedules(
        project,
        this.loopStart,
        this.loopStart + (winEnd - this.loopEnd),
        nowCtx + beatToSec(this.loopEnd - nowBeat, tempo),
        this.loopEnd,
        tempo
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
    this.scheduled.clear();
    const { clock, synth } = await initAudioGraph();
    stopTransport(clock, synth);
  }

  getPlayheadBeat() {
    return this.anchor?.beat ?? this.startBeat;
  }
}

export const scheduler = new LookaheadScheduler();
