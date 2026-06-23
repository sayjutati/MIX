import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { PROJECT_VERSION, type Project } from "../types/project";

interface DtmDb extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { "by-updated": number };
  };
}

const DB_NAME = "dtm-studio";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<DtmDb>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<DtmDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore("projects", { keyPath: "id" });
        store.createIndex("by-updated", "updatedAt");
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

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("projects", id);
}
