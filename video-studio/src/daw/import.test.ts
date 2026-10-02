import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeAudioData, parseDawProject } from "./import";

// 実際の DAW (daw-studio/src/storage/projectIO.ts) は FileReader.readAsDataURL の結果をそのまま保存する
const dataUrl = (text: string) => `data:audio/wav;base64,${btoa(text)}`;

// jsdom の Blob には text() が無い
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsText(blob);
  });

beforeEach(() => {
  let n = 0;
  vi.stubGlobal("URL", {
    createObjectURL: () => `blob:test/${n++}`,
    revokeObjectURL: () => {},
  });
});

describe("decodeAudioData", () => {
  it("DAW が保存する data URL をデコードできる", async () => {
    const blob = decodeAudioData(dataUrl("RIFFdata"));
    expect(blob.type).toBe("audio/wav");
    expect(await readBlob(blob)).toBe("RIFFdata");
  });

  it("生の base64 も受け付け、data URL の MIME を尊重する", async () => {
    expect(await readBlob(decodeAudioData(btoa("abc")))).toBe("abc");
    expect(decodeAudioData(`data:audio/mpeg;base64,${btoa("x")}`).type).toBe("audio/mpeg");
  });
});

describe("parseDawProject", () => {
  const project = {
    version: 6,
    tracks: [
      {
        id: 1,
        name: "BGM",
        kind: "bgm",
        volume: 0.5,
        speed: 1,
        nudgeMs: 250,
        clips: [{ id: 11, offset: 2, duration: 10, audioData: dataUrl("a") }],
      },
      {
        id: 2,
        name: "Vocal",
        kind: "vocal",
        volume: 0.8,
        speed: 2,
        clips: [
          { id: 21, offset: 0, duration: 8, audioData: dataUrl("b") },
          { id: 22, offset: 0, duration: 8, audioData: dataUrl("c"), muted: true },
        ],
      },
      {
        id: 3,
        name: "Muted",
        kind: "vocal",
        isMuted: true,
        clips: [{ id: 31, offset: 0, duration: 3, audioData: dataUrl("d") }],
      },
    ],
  };

  it("ミュートされたトラック/テイクを除外し、音量・速度・ナッジを反映する", () => {
    const { assets, clips } = parseDawProject(project);
    expect(assets).toHaveLength(2);
    expect(clips).toHaveLength(2);

    const [bgm, vocal] = clips;
    expect(bgm!.start).toBeCloseTo(2.25);
    expect(bgm!.volume).toBe(0.5);
    expect(bgm!.duration).toBe(10);

    expect(vocal!.speed).toBe(2);
    expect(vocal!.duration).toBe(4);
  });

  it("ソロがあればソロトラックのみ取り込む", () => {
    const solo = {
      ...project,
      tracks: project.tracks.map((t) => (t.id === 2 ? { ...t, isSolo: true } : t)),
    };
    const { clips } = parseDawProject(solo);
    expect(clips).toHaveLength(1);
    expect(clips[0]!.volume).toBe(0.8);
  });

  it("複数回取り込んでもアセット ID が衝突しない", () => {
    const a = parseDawProject(project);
    const b = parseDawProject(project);
    const ids = new Set([...a.assets, ...b.assets].map((x) => x.id));
    expect(ids.size).toBe(a.assets.length + b.assets.length);
  });
});
