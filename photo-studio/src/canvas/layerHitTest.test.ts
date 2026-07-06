import { describe, expect, it } from "vitest";
import { hitTestLayer, pointInLayer } from "./layerHitTest";
import { makeLayer, makeProject } from "../types/document";

describe("layerHitTest", () => {
  const project = makeProject({ width: 400, height: 400 });
  const layer = makeLayer({
    assetId: "a1",
    width: 100,
    height: 100,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, flipX: false, flipY: false },
  });
  const p = { ...project, layers: [layer] };

  it("pointInLayer at center", () => {
    expect(pointInLayer(p, layer, 200, 200)).toBe(true);
  });

  it("pointInLayer outside", () => {
    expect(pointInLayer(p, layer, 10, 10)).toBe(false);
  });

  it("hitTestLayer returns top layer", () => {
    const l2 = makeLayer({ assetId: "a2", width: 200, height: 200, name: "top" });
    const stacked = { ...project, layers: [layer, l2] };
    expect(hitTestLayer(stacked, 200, 200)).toBe(l2.id);
  });

  it("skips locked layers", () => {
    const locked = { ...layer, locked: true };
    const proj = { ...project, layers: [locked] };
    expect(hitTestLayer(proj, 200, 200)).toBeNull();
  });
});
