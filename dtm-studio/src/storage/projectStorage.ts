import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { PROJECT_VERSION, type Project } from "../types/project";

interface DtmDb extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { "by-updated": number };
  };
  audioAssets: {
    key: string;
    value: {
      id: string;
      projectId: string;
      name: string;
      mimeType: string;
      blob: Blob;
      createdAt: number;
    };
    indexes: { "by-project": string };
  };
}

const DB_NAME = "dtm-studio";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<DtmDb>> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<DtmDb>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore("projects", { keyPath: "id" });
          store.createIndex("by-updated", "updatedAt");
        }
        if (oldVersion < 2 && !db.objectStoreNames.contains("audioAssets")) {
          const assets = db.createObjectStore("audioAssets", { keyPath: "id" });
          assets.createIndex("by-project", "projectId");
        }
      },
    });
  }
  return dbPromise;
}

export async function saveProject(project: Project): Promise<void> {
  const db = await getDb();
  await db.put("projects", { ...project, version: PROJECT_VERSION, updatedAt: Date.now() });
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const db = await getDb();
  return db.get("projects", id);
}

export async function listProjects(): Promise<Project[]> {
  const db = await getDb();
  return db.getAllFromIndex("projects", "by-updated");
}

/** 最終更新プロジェクトを復元用に取得 */
export async function loadLatestProject(): Promise<Project | null> {
  const all = await listProjects();
  if (all.length === 0) return null;
  return all[all.length - 1] ?? null;
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("projects", id);
}
