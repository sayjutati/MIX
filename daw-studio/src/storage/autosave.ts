import type { ProjectFile, Track } from "../types";
import { deserializeProject, serializeProject } from "./projectIO";

const DB_NAME = "mix-daw-autosave";
const STORE = "projects";
const KEY = "latest";

type AutosaveRecord = {
  savedAt: number;
  project: ProjectFile;
};

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
  });

export const saveAutosave = async (
  tracks: Track[],
  bpm: number,
  masterVolume: number,
  globalTime: number,
  pitchLimit: number
): Promise<void> => {
  if (tracks.length === 0) return;
  const project = await serializeProject(tracks, bpm, masterVolume, globalTime, pitchLimit);
  const record: AutosaveRecord = { savedAt: Date.now(), project };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(record, KEY);
  });
  db.close();
};

export const loadAutosave = async (): Promise<{
  savedAt: number;
  data: Awaited<ReturnType<typeof deserializeProject>>;
} | null> => {
  try {
    const db = await openDb();
    const record = await new Promise<AutosaveRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as AutosaveRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!record?.project) return null;
    const data = await deserializeProject(record.project);
    return { savedAt: record.savedAt, data };
  } catch {
    return null;
  }
};

export const clearAutosave = async (): Promise<void> => {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).delete(KEY);
    });
    db.close();
  } catch {
    /* noop */
  }
};
