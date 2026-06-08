import type { Track } from "../types";
import { saveAutosave } from "./autosave";

export type AutosaveSnapshot = {
  tracks: Track[];
  bpm: number;
  masterVolume: number;
  globalTime: number;
  pitchLimit: number;
};

/** 変更後すぐ＋定期で IndexedDB に書き込む */
export class AutosaveScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private enabled = false;
  private saving = false;
  private pending: AutosaveSnapshot | null = null;
  private getSnapshot: (() => AutosaveSnapshot) | null = null;

  start(getSnapshot: () => AutosaveSnapshot) {
    this.getSnapshot = getSnapshot;
    this.enabled = true;
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => this.flush(0), 20_000);
    const onHide = () => {
      if (document.visibilityState === "hidden") this.flush(0);
    };
    window.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      this.enabled = false;
      if (this.timer) clearTimeout(this.timer);
      if (this.interval) clearInterval(this.interval);
      window.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }

  /** 変更後 debounce ms で保存（既定 4 秒） */
  schedule(delayMs = 4000) {
    if (!this.enabled) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(0), delayMs);
  }

  /** 録音直後など即時保存 */
  flush(delayMs = 0) {
    if (!this.enabled || !this.getSnapshot) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const run = () => {
      const snap = this.getSnapshot!();
      if (snap.tracks.length === 0) return;
      this.pending = snap;
      void this.runSave();
    };
    if (delayMs > 0) this.timer = setTimeout(run, delayMs);
    else run();
  }

  private async runSave() {
    if (this.saving) return;
    const snap = this.pending;
    if (!snap) return;
    this.pending = null;
    this.saving = true;
    try {
      await saveAutosave(
        snap.tracks,
        snap.bpm,
        snap.masterVolume,
        snap.globalTime,
        snap.pitchLimit
      );
    } catch {
      /* 次回リトライ */
    } finally {
      this.saving = false;
      if (this.pending) void this.runSave();
    }
  }
}
