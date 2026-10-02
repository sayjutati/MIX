/**
 * アプリ間の受け渡し。ポータルは同一オリジンなので IndexedDB を共有できる。
 * 各アプリに同内容のコピーを置く（ビルドが独立しているため）。
 *
 * 流れ: DTM 伴奏 → DAW ミックス → Video 音声 / Photo サムネ ← Video フレーム
 */
export type HandoffKey = "dtm-mix" | "daw-mix" | "video-frame" | "photo-overlay";

export type HandoffRecord = {
  name: string;
  blob: Blob;
  createdAt: number;
};

const DB_NAME = "mix-handoff";
const STORE = "items";
/** 古い受け渡しは無視する（放置されたデータを突然取り込まない） */
const MAX_AGE_MS = 10 * 60 * 1000;

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const putHandoff = async (key: HandoffKey, name: string, blob: Blob): Promise<void> => {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ name, blob, createdAt: Date.now() } satisfies HandoffRecord, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};

/** 取り出して削除する。無い・古い場合は null */
export const takeHandoff = async (
  key: HandoffKey,
  now = Date.now()
): Promise<HandoffRecord | null> => {
  const db = await openDb();
  try {
    const rec = await new Promise<HandoffRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        store.delete(key);
        resolve((req.result as HandoffRecord | undefined) ?? null);
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    if (!rec || now - rec.createdAt > MAX_AGE_MS) return null;
    return rec;
  } finally {
    db.close();
  }
};
