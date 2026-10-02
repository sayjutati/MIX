// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { putHandoff, takeHandoff } from "./handoff";

describe("handoff", () => {
  it("returns the stored blob once, then nothing", async () => {
    await putHandoff("video-frame", "f.png", new Blob(["abc"], { type: "image/png" }));
    const rec = await takeHandoff("video-frame");
    expect(rec?.name).toBe("f.png");
    expect(await rec!.blob.text()).toBe("abc");
    expect(await takeHandoff("video-frame")).toBeNull();
  });

  it("ignores stale entries but still clears them", async () => {
    await putHandoff("daw-mix", "m.wav", new Blob(["x"]));
    expect(await takeHandoff("daw-mix", Date.now() + 11 * 60 * 1000)).toBeNull();
    expect(await takeHandoff("daw-mix")).toBeNull();
  });

  it("keeps keys independent", async () => {
    await putHandoff("daw-mix", "a.wav", new Blob(["1"]));
    expect(await takeHandoff("video-frame")).toBeNull();
    expect((await takeHandoff("daw-mix"))?.name).toBe("a.wav");
  });

  it("stores dtm-mix and photo-overlay separately", async () => {
    await putHandoff("dtm-mix", "bgm.wav", new Blob(["d"]));
    await putHandoff("photo-overlay", "t.png", new Blob(["p"]));
    expect((await takeHandoff("dtm-mix"))?.name).toBe("bgm.wav");
    expect((await takeHandoff("photo-overlay"))?.name).toBe("t.png");
  });
});
