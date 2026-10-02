// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { getImageAsset, saveImageAsset } from "./imageAssets";
import {
  deserializeProject,
  parseProjectFile,
  restoreEmbeddedAssets,
  serializeProject,
} from "./projectStorage";
import { makeLayer, makeProject } from "../types/document";

const readBlob = (b: Blob) => b.text();

describe("project file round trip", () => {
  it("embeds assets and restores them under the same id", async () => {
    const assetId = await saveImageAsset(
      "p1",
      new Blob(["PNGDATA"], { type: "image/png" }),
      "a.png",
      4,
      3
    );
    const project = makeProject({
      id: "p1",
      layers: [makeLayer({ assetId, width: 4, height: 3 }), makeLayer({ assetId, width: 4, height: 3 })],
    });

    const text = await serializeProject(project);
    const parsed = parseProjectFile(text);
    expect(Object.keys(parsed.assets ?? {})).toEqual([assetId]);

    const moved = { ...parsed, project: { ...parsed.project, id: "p2" } };
    await restoreEmbeddedAssets(moved);
    const rec = await getImageAsset(assetId);
    expect(rec?.projectId).toBe("p2");
    expect(rec?.width).toBe(4);
    expect(await readBlob(rec!.blob)).toBe("PNGDATA");
    expect(deserializeProject(parsed).layers).toHaveLength(2);
  });

  it("accepts legacy v1 files without assets", async () => {
    const project = makeProject({ layers: [] });
    const parsed = parseProjectFile(JSON.stringify({ version: 1, project }));
    await expect(restoreEmbeddedAssets(parsed)).resolves.toBeUndefined();
  });

  it("rejects malformed files", () => {
    expect(() => parseProjectFile("{}")).toThrow();
    expect(() => parseProjectFile('{"project":{}}')).toThrow();
    expect(() => parseProjectFile("null")).toThrow();
  });
});
