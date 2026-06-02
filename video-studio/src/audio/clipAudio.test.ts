import { describe, expect, it } from "vitest";
import { collectAudibleClips, isTrackAudible } from "./clipAudio";
import type { EditorState, MediaAsset, TimelineClip, Track } from "../types";
import { createDefaultTracks, defaultEffects, initialEditorState } from "../types";

const asset = (id: string, kind: MediaAsset["kind"] = "audio"): MediaAsset => ({
  id,
  name: id,
  kind,
  url: `blob:${id}`,
  duration: 10,
});

const audioClip = (
  id: string,
  trackId: string,
  start: number,
  opts?: Partial<TimelineClip>
): TimelineClip => ({
  id,
  assetId: "a1",
  trackId,
  start,
  duration: 5,
  inPoint: 0,
  speed: 1,
  volume: 1,
  opacity: 100,
  audioMuted: false,
  effects: defaultEffects(),
  opacityKeyframes: [],
  ...opts,
});

describe("isTrackAudible", () => {
  it("mutes non-solo tracks when solo active", () => {
    const tracks: Track[] = [
      { ...createDefaultTracks()[2], solo: true },
      { ...createDefaultTracks()[3], solo: false },
    ];
    expect(isTrackAudible(tracks, tracks[0].id)).toBe(true);
    expect(isTrackAudible(tracks, tracks[1].id)).toBe(false);
  });
});

describe("collectAudibleClips", () => {
  it("includes DAW and video-linked but not muted", () => {
    const state: EditorState = {
      ...initialEditorState(),
      assets: [asset("a1"), asset("v1", "video")],
      clips: [
        audioClip("c1", "a2", 0, { origin: "daw", assetId: "a1" }),
        audioClip("c2", "a1", 0, { origin: "video-linked", assetId: "v1" }),
        audioClip("c3", "a1", 6, { origin: "video-linked", assetId: "v1", audioMuted: true }),
      ],
    };
    const at0 = collectAudibleClips(state, 1);
    expect(at0).toHaveLength(2);
    expect(at0.map((x) => x.clip.origin)).toContain("daw");
    expect(at0.map((x) => x.clip.origin)).toContain("video-linked");
  });
});
