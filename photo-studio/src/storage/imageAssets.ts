const urlCache = new Map<string, string>();

export type ImageAssetRecord = {
  id: string;
  projectId: string;
  name: string;
  mimeType: string;
  blob: Blob;
  width: number;
  height: number;
  createdAt: number;
};

export const makeAssetId = () => `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const DB_NAME = "mix-photo-studio";
const DB_VERSION = 1;

type Db = IDBDatabase;

let dbPromise: Promise<Db> | null = null;

const openDb = (): Promise<Db> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("assets")) {
        const store = db.createObjectStore("assets", { keyPath: "id" });
        store.createIndex("by-project", "projectId");
      }
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
};

export const saveImageAsset = async (
  projectId: string,
  blob: Blob,
  name: string,
  width: number,
  height: number
): Promise<string> => {
  const id = makeAssetId();
  const db = await openDb();
  const rec: ImageAssetRecord = {
    id,
    projectId,
    name,
    mimeType: blob.type || "image/png",
    blob,
    width,
    height,
    createdAt: Date.now(),
  };
  await new Promise<void>((res, rej) => {
    const tx = db.transaction("assets", "readwrite");
    tx.objectStore("assets").put(rec);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  revokeAssetUrl(id);
  return id;
};

export const getImageAsset = async (id: string): Promise<ImageAssetRecord | undefined> => {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction("assets", "readonly");
    const req = tx.objectStore("assets").get(id);
    req.onsuccess = () => res(req.result as ImageAssetRecord | undefined);
    req.onerror = () => rej(req.error);
  });
};

export const getAssetUrl = async (id: string): Promise<string | null> => {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const rec = await getImageAsset(id);
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(id, url);
  return url;
};

export const revokeAssetUrl = (id: string) => {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
};

export const loadImageDimensions = (blob: Blob): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像サイズの取得に失敗"));
    };
    img.src = url;
  });
