import type { PitchNote } from "../types";
import type { PitchDetectResult } from "./pitchDetect.worker";

let worker: Worker | null = null;

const getWorker = () => {
  if (!worker) {
    worker = new Worker(new URL("./pitchDetect.worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
};

/** メインスレッドをブロックせずピッチノートを検出 */
export const detectNotesAsync = (mono: Float32Array, sampleRate: number): Promise<PitchNote[]> =>
  new Promise((resolve, reject) => {
    const w = getWorker();
    const copy = new Float32Array(mono);
    const onMsg = (e: MessageEvent<PitchDetectResult>) => {
      w.removeEventListener("message", onMsg);
      w.removeEventListener("error", onErr);
      resolve(e.data.notes);
    };
    const onErr = (err: ErrorEvent) => {
      w.removeEventListener("message", onMsg);
      w.removeEventListener("error", onErr);
      reject(err.error ?? new Error("pitch detect worker failed"));
    };
    w.addEventListener("message", onMsg);
    w.addEventListener("error", onErr);
    w.postMessage({ mono: copy, sampleRate }, [copy.buffer]);
  });
