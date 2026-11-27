import { describe, expect, it } from "vitest";
import { base64ToBlob, parsePPhotoJson } from "./importPhoto";

describe("importPhoto helpers", () => {
  it("BOM 付きの .pphoto JSON も正しくパースできる", () => {
    const raw =
      "\uFEFF" +
      JSON.stringify({
        version: 2,
        project: {
          name: "サムネイル",
          width: 1920,
          height: 1080,
          layers: [{ id: "l1", assetId: "a1", width: 400, height: 300, visible: true }],
        },
        assets: {
          a1: { name: "x.png", mimeType: "image/png", width: 400, height: 300, data: btoa("PNG") },
        },
      });
    const parsed = parsePPhotoJson(raw);
    expect(parsed.project?.name).toBe("サムネイル");
    expect(parsed.project?.layers).toHaveLength(1);
  });

  it("layers を持たない不正 JSON を拒否する", () => {
    expect(() => parsePPhotoJson(JSON.stringify({ foo: 1 }))).toThrow();
  });

  it("base64 と data URL の双方から Blob を復元する", () => {
    const b1 = base64ToBlob(btoa("hello"), "image/png");
    expect(b1.type).toBe("image/png");
    expect(b1.size).toBe(5);

    const b2 = base64ToBlob(`data:image/webp;base64,${btoa("world!")}`, "image/webp");
    expect(b2.type).toBe("image/webp");
    expect(b2.size).toBe(6);
  });
});
