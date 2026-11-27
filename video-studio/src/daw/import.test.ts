import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeAudioData, parseDawProject } from "./import";

// 実際の DAW (daw-studio/src/storage/projectIO.ts) は FileReader.readAsDataURL の結果をそのまま保存する
const dataUrl = (text: string) => `data:audio/wav;base64,${btoa(text)}`;

// jsdom の Blob には text() が無い場合があるため FileReader で読む
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
        fadeIn: 1.5,
        clips: [{ id: 11, offset: 2, duration: 10, audioData: dataUrl("a") }],
      },
      {
        id: 2,
        name: "Vocal",
        kind: "vocal",
        color: "#e74c3c",
        volume: 0.8,
        speed: 2,
        reverb: 0.4,
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

  it("ミュート除外・音量・速度・ナッジ・opacity=100・トラック分離を正しく反映する", () => {
    const { assets, clips, extraTracks, hasUnbakedFx } = parseDawProject(project, "a2");
    expect(assets).toHaveLength(2);
    expect(clips).toHaveLength(2);
    expect(extraTracks).toHaveLength(1);
    expect(hasUnbakedFx).toBe(true);

    const [bgm, vocal] = clips;
    expect(bgm!.trackId).toBe("a2");
    expect(bgm!.start).toBeCloseTo(2.25);
    expect(bgm!.volume).toBe(0.5);
    expect(bgm!.duration).toBe(10);
    expect(bgm!.opacity).toBe(100);
    expect(bgm!.fadeIn).toBe(1.5);

    expect(vocal!.trackId).toBe(extraTracks[0]!.id);
    expect(extraTracks[0]!.name).toBe("DAW: Vocal");
    expect(vocal!.speed).toBe(2);
    expect(vocal!.duration).toBe(4);
    expect(vocal!.opacity).toBe(100);
  });

  it("負の nudgeMs で 0 秒未満にはみ出る場合、inPoint を進めてタイミングズレを防ぐ", () => {
    const neg = {
      version: 6,
      tracks: [
        {
          id: 1,
          name: "Lead",
          nudgeMs: -200,
          speed: 1,
          clips: [{ id: 1, offset: 0, duration: 10, audioData: dataUrl("lead") }],
        },
      ],
    };
    const { clips } = parseDawProject(neg);
    expect(clips).toHaveLength(1);
    expect(clips[0]!.start).toBe(0);
    expect(clips[0]!.inPoint).toBeCloseTo(0.2);
    expect(clips[0]!.duration).toBeCloseTo(9.8);
  });

  it("v3 以前の単一クリップ形式トラックも取り込める", () => {
    const legacy = {
      version: 3,
      masterVolume: 0.5,
      tracks: [
        {
          id: 1,
          name: "LegacyTrack",
          volume: 1,
          offset: 1,
          duration: 6,
          audioData: dataUrl("old"),
        },
      ],
    };
    const { clips } = parseDawProject(legacy);
    expect(clips).toHaveLength(1);
    expect(clips[0]!.start).toBe(1);
    expect(clips[0]!.duration).toBe(6);
    expect(clips[0]!.volume).toBeCloseTo(0.5);
  });

  it("ソロがあればソロトラックのみ取り込む", () => {
    const solo = {
      ...project,
      tracks: project.tracks.map((t) => (t.id === 2 ? { ...t, isSolo: true } : t)),
    };
    const { clips, extraTracks } = parseDawProject(solo);
    expect(clips).toHaveLength(1);
    expect(extraTracks).toHaveLength(0);
    expect(clips[0]!.volume).toBe(0.8);
  });

  it("複数回取り込んでもアセット ID が衝突しない", () => {
    const a = parseDawProject(project);
    const b = parseDawProject(project);
    const ids = new Set([...a.assets, ...b.assets].map((x) => x.id));
    expect(ids.size).toBe(a.assets.length + b.assets.length);
  });
});
