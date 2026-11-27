/**
 * アプリ間のデータ受け渡し。
 * - ポータル（同一オリジン）: IndexedDB + BroadcastChannel で新規タブ・既存タブの双方に即座に届ける
 * - 単体 dev（別ポート間）: window.opener との postMessage ハンドシェイクでポート境界を越えて Blob を直接転送する
 */
export type HandoffKey =
  | "dtm-mix"
  | "dtm-video"
  | "daw-mix"
  | "video-frame"
  | "photo-overlay";

export type HandoffRecord = {
  name: string;
  blob: Blob;
  createdAt: number;
};

const DB_NAME = "mix-handoff";
const STORE = "items";
const CHANNEL_NAME = "mix-handoff-channel";
/** 古い受け渡しは無視する（放置されたデータを突然取り込まない） */
const MAX_AGE_MS = 10 * 60 * 1000;
const OPENER_PULL_TIMEOUT_MS = 450;

const VALID_KEYS = new Set<string>([
  "dtm-mix",
  "dtm-video",
  "daw-mix",
  "video-frame",
  "photo-overlay",
]);

const memoryStore = new Map<HandoffKey, HandoffRecord>();
let responderBound = false;

const isTrustedOrigin = (origin: string): boolean => {
  if (!origin) return false;
  if (typeof location !== "undefined" && origin === location.origin) return true;
  try {
    const u = new URL(origin);
    const currentHost = typeof location !== "undefined" ? location.hostname : "";
    const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", currentHost]);
    return localHosts.has(u.hostname);
  } catch {
    return false;
  }
};

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const deleteFromDb = async (key: HandoffKey): Promise<void> => {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } finally {
      db.close();
    }
  } catch {
    // ignore cleanup failure
  }
};

const ensureOpenerResponder = () => {
  if (responderBound || typeof window === "undefined") return;
  responderBound = true;
  window.addEventListener("message", (e: MessageEvent) => {
    if (!isTrustedOrigin(e.origin)) return;
    const data = e.data as { type?: string; key?: string } | null;
    if (!data || data.type !== "mix-handoff-pull" || !data.key || !VALID_KEYS.has(data.key)) {
      return;
    }
    const key = data.key as HandoffKey;
    const rec = memoryStore.get(key);
    if (!rec) return;
    memoryStore.delete(key);
    void deleteFromDb(key);
    if (Date.now() - rec.createdAt > MAX_AGE_MS) return;
    const target = e.source as WindowProxy | null;
    try {
      target?.postMessage({ type: "mix-handoff-push", key, record: rec }, e.origin);
    } catch {
      // ignore closed window
    }
  });
};

const notifySameOriginTabs = (key: HandoffKey) => {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage({ type: "mix-handoff-ready", key });
    ch.close();
  } catch {
    // ignore unsupported environments
  }
};

const pullFromOpener = (key: HandoffKey, now: number): Promise<HandoffRecord | null> => {
  if (typeof window === "undefined" || !window.opener || window.opener === window) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (rec: HandoffRecord | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(rec);
    };
    const onMessage = (e: MessageEvent) => {
      if (!isTrustedOrigin(e.origin)) return;
      const data = e.data as {
        type?: string;
        key?: string;
        record?: HandoffRecord;
      } | null;
      if (!data || data.type !== "mix-handoff-push" || data.key !== key || !data.record) {
        return;
      }
      const rec = data.record;
      if (!(rec.blob instanceof Blob) || now - rec.createdAt > MAX_AGE_MS) {
        finish(null);
        return;
      }
      finish(rec);
    };
    const timer = setTimeout(() => finish(null), OPENER_PULL_TIMEOUT_MS);
    window.addEventListener("message", onMessage);
    try {
      window.opener.postMessage({ type: "mix-handoff-pull", key }, "*");
    } catch {
      finish(null);
    }
  });
};

export const putHandoff = async (key: HandoffKey, name: string, blob: Blob): Promise<void> => {
  const record: HandoffRecord = { name, blob, createdAt: Date.now() };
  memoryStore.set(key, record);
  ensureOpenerResponder();

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }

  notifySameOriginTabs(key);
};

/** 取り出して削除する。無い・古い場合は null（同一オリジン IndexedDB → window.opener の順に探索） */
export const takeHandoff = async (
  key: HandoffKey,
  now = Date.now()
): Promise<HandoffRecord | null> => {
  const db = await openDb();
  let rec: HandoffRecord | null = null;
  try {
    rec = await new Promise<HandoffRecord | null>((resolve, reject) => {
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
  } finally {
    db.close();
  }

  memoryStore.delete(key);

  if (rec) {
    return now - rec.createdAt > MAX_AGE_MS ? null : rec;
  }

  return pullFromOpener(key, now);
};

/** 既に開いているタブでハンドオフ到着やタブ復帰を検知して受け取る購読ヘルパー */
export const subscribeHandoff = (
  keys: readonly HandoffKey[],
  onCheck: (key: HandoffKey) => void
): (() => void) => {
  if (typeof window === "undefined") return () => {};
  const keySet = new Set<HandoffKey>(keys);
  let ch: BroadcastChannel | null = null;

  if (typeof BroadcastChannel !== "undefined") {
    try {
      ch = new BroadcastChannel(CHANNEL_NAME);
      ch.onmessage = (e: MessageEvent) => {
        const data = e.data as { type?: string; key?: HandoffKey } | null;
        if (data?.type === "mix-handoff-ready" && data.key && keySet.has(data.key)) {
          onCheck(data.key);
        }
      };
    } catch {
      ch = null;
    }
  }

  const onFocus = () => {
    for (const k of keys) onCheck(k);
  };
  window.addEventListener("focus", onFocus);

  return () => {
    ch?.close();
    window.removeEventListener("focus", onFocus);
  };
};
