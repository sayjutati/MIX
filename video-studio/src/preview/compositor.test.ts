import { describe, expect, it } from "vitest";
import { buildVisualOps, computeVisualBounds, hitTestVisualClip } from "./compositor";
import { defaultEffects, initialEditorState, type EditorState, type MediaAsset, type TimelineClip } from "../types";

const videoAsset = (id: string, width = 1920, height = 1080): MediaAsset => ({
  id,
  name: id,
  kind: "video",
  url: `blob:${id}`,
  duration: 10,
  width,
  height,
});

const makeVideoClip = (
  id: string,
  assetId: string,
  start: number,
  duration: number,
  extra?: Partial<TimelineClip>
): TimelineClip => ({
  id,
  assetId,
  trackId: "v1",
  start,
  duration,
  inPoint: 0,
  speed: 1,
  volume: 1,
  opacity: 100,
  audioMuted: false,
  effects: defaultEffects(),
  opacityKeyframes: [],
  ...extra,
});

describe("buildVisualOps parity & crossfade", () => {
  it("blends incoming clip over opaque outgoing clip during adjacent crossfade without dipping to black", () => {
    const state: EditorState = {
      ...initialEditorState(),
      assets: [videoAsset("a"), videoAsset("b")],
      clips: [
        makeVideoClip("c1", "a", 0, 4, {
          transitionOut: { kind: "crossfade", duration: 1 },
        }),
        makeVideoClip("c2", "b", 4, 4, {
          fadeIn: 0.5,
        }),
      ],
    };

    const mid = buildVisualOps(state, 3.5);
    expect(mid).toHaveLength(2);
    expect(mid[0]!.clip.id).toBe("c1");
    expect(mid[0]!.alpha).toBeCloseTo(1, 3);
    expect(mid[1]!.clip.id).toBe("c2");
    expect(mid[1]!.alpha).toBeCloseTo(0.5, 3);
  });

  it("applies clip fadeIn and fadeOut identically to visual alpha", () => {
    const state: EditorState = {
      ...initialEditorState(),
      assets: [videoAsset("a")],
      clips: [makeVideoClip("c1", "a", 0, 4, { fadeIn: 1, fadeOut: 1 })],
    };
    expect(buildVisualOps(state, 0.25)[0]!.alpha).toBeCloseTo(0.25, 3);
    expect(buildVisualOps(state, 2.0)[0]!.alpha).toBeCloseTo(1, 3);
    expect(buildVisualOps(state, 3.5)[0]!.alpha).toBeCloseTo(0.5, 3);
  });
});

describe("computeVisualBounds & hitTestVisualClip", () => {
  it("computes contain vs cover bounds accurately for vertical video on 16:9 canvas", () => {
    const clip = makeVideoClip("c1", "vert", 0, 5);
    const contain = computeVisualBounds(clip, 1080, 1920, 1920, 1080);
    expect(contain.height).toBeCloseTo(1080);
    expect(contain.width).toBeCloseTo(607.5);

    const coverClip: TimelineClip = {
      ...clip,
      transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, fit: "cover", flipH: false },
    };
    const cover = computeVisualBounds(coverClip, 1080, 1920, 1920, 1080);
    expect(cover.width).toBeCloseTo(1920);
    expect(cover.height).toBeCloseTo(3413.333, 2);

    const state: EditorState = {
      ...initialEditorState(),
      assets: [videoAsset("vert", 1080, 1920)],
      clips: [clip],
    };
    expect(hitTestVisualClip(state, clip, 960, 540)).toBe(true);
    expect(hitTestVisualClip(state, clip, 100, 540)).toBe(false);
  });
});
