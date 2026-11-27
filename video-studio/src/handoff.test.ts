import { beforeEach, describe, expect, it, vi } from "vitest";
import { putHandoff, takeHandoff } from "./handoff";

const storeMap = new Map<string, unknown>();

const createFakeIdb = () => ({
  open: () => {
    const req: Record<string, unknown> = {};
    const db = {
      createObjectStore: () => ({}),
      close: () => {},
      transaction: () => {
        const tx: Record<string, unknown> = {};
        const store = {
          put: (val: unknown, key: string) => {
            storeMap.set(key, val);
            queueMicrotask(() => (tx.oncomplete as (() => void) | undefined)?.());
          },
          get: (key: string) => {
            const g: Record<string, unknown> = { result: storeMap.get(key) };
            queueMicrotask(() => {
              (g.onsuccess as (() => void) | undefined)?.();
              queueMicrotask(() => (tx.oncomplete as (() => void) | undefined)?.());
            });
            return g;
          },
          delete: (key: string) => {
            storeMap.delete(key);
            queueMicrotask(() => (tx.oncomplete as (() => void) | undefined)?.());
          },
        };
        return Object.assign(tx, { objectStore: () => store });
      },
    };
    req.result = db;
    queueMicrotask(() => (req.onsuccess as (() => void) | undefined)?.());
    return req;
  },
});

beforeEach(() => {
  storeMap.clear();
  vi.stubGlobal("indexedDB", createFakeIdb());
});

describe("handoff (video-studio)", () => {
  it("stores and consumes daw-mix, dtm-video, and photo-overlay once", async () => {
    await putHandoff("daw-mix", "vocal.wav", new Blob(["daw"], { type: "audio/wav" }));
    await putHandoff("dtm-video", "bgm.wav", new Blob(["dtm"], { type: "audio/wav" }));
    await putHandoff("photo-overlay", "frame.png", new Blob(["png"], { type: "image/png" }));

    expect((await takeHandoff("daw-mix"))?.name).toBe("vocal.wav");
    expect((await takeHandoff("dtm-video"))?.name).toBe("bgm.wav");
    expect((await takeHandoff("photo-overlay"))?.name).toBe("frame.png");

    expect(await takeHandoff("daw-mix")).toBeNull();
    expect(await takeHandoff("dtm-video")).toBeNull();
    expect(await takeHandoff("photo-overlay")).toBeNull();
  });

  it("falls back to window.opener postMessage across ports when IndexedDB is empty", async () => {
    const listeners = new Set<(e: MessageEvent) => void>();
    const fakeBlob = new Blob(["cross-port-wav"], { type: "audio/wav" });

    const opener = {
      postMessage: (msg: { type?: string; key?: string }) => {
        if (msg?.type === "mix-handoff-pull" && msg.key === "daw-mix") {
          setTimeout(() => {
            for (const fn of listeners) {
              fn({
                origin: "http://localhost:1420",
                data: {
                  type: "mix-handoff-push",
                  key: "daw-mix",
                  record: { name: "from-1420.wav", blob: fakeBlob, createdAt: Date.now() },
                },
              } as MessageEvent);
            }
          }, 5);
        }
      },
    };

    const prevOpener = window.opener;
    Object.defineProperty(window, "opener", { value: opener, configurable: true });
    const origAdd = window.addEventListener.bind(window);
    const origRem = window.removeEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation(((type: string, fn: EventListener) => {
      if (type === "message") listeners.add(fn as unknown as (e: MessageEvent) => void);
      else origAdd(type, fn);
    }) as typeof window.addEventListener);
    vi.spyOn(window, "removeEventListener").mockImplementation(((type: string, fn: EventListener) => {
      if (type === "message") listeners.delete(fn as unknown as (e: MessageEvent) => void);
      else origRem(type, fn);
    }) as typeof window.removeEventListener);

    try {
      const rec = await takeHandoff("daw-mix");
      expect(rec?.name).toBe("from-1420.wav");
      expect(rec?.blob.size).toBe(fakeBlob.size);
    } finally {
      Object.defineProperty(window, "opener", { value: prevOpener, configurable: true });
      vi.restoreAllMocks();
    }
  });
});
