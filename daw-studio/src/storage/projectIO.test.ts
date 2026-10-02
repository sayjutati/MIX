import { describe, expect, it } from "vitest";
import { deserializeProject } from "./projectIO";
import { PROJECT_VERSION, type ProjectFile } from "../types";

const WAV = "data:audio/wav;base64,UklGRgAAAABXQVZF";

const file = (over: Partial<ProjectFile> = {}): ProjectFile => ({
  version: PROJECT_VERSION,
  bpm: 100,
  masterVolume: 0.5,
  tracks: [],
  ...over,
});

describe("deserializeProject", () => {
  it("restores tracks with defaults filled in", async () => {
    const r = await deserializeProject(
      file({
        tracks: [
          {
            id: 1,
            name: "a",
            color: "#fff",
            clips: [{ id: 7, url: "", offset: 1, duration: 2, audioData: WAV }],
          } as ProjectFile["tracks"][number],
        ],
      })
    );
    expect(r.bpm).toBe(100);
    expect(r.pitchLimit).toBe(2);
    expect(r.tracks[0].clips[0]).toMatchObject({ id: 7, offset: 1, duration: 2 });
    expect(r.tracks[0].clips[0].url.startsWith("blob:")).toBe(true);
    expect(r.tracks[0].speed).toBe(1);
    expect(r.tracks[0].kind).toBe("vocal");
  });

  it("rejects files that are not projects", async () => {
    await expect(deserializeProject({} as ProjectFile)).rejects.toThrow();
    await expect(deserializeProject(null as unknown as ProjectFile)).rejects.toThrow();
  });

  it("rejects clips without audio data instead of fetching 'undefined'", async () => {
    const bad = file({
      tracks: [
        { id: 1, name: "a", color: "#fff", clips: [{ id: 1, url: "", offset: 0, duration: 1 }] },
      ] as ProjectFile["tracks"],
    });
    await expect(deserializeProject(bad)).rejects.toThrow(/音声データ/);
  });

  it("rejects legacy single-clip tracks without audio data", async () => {
    const bad = file({
      tracks: [{ id: 1, name: "a", color: "#fff" }] as ProjectFile["tracks"],
    });
    await expect(deserializeProject(bad)).rejects.toThrow(/音声データ/);
  });
});
