import { describe, expect, it } from "vitest";
import { defaultTextStyle, textStyleFromLegacy } from "./textStyle";

describe("textStyleFromLegacy", () => {
  it("migrates v2 flat fields", () => {
    const s = textStyleFromLegacy({
      fontSize: 64,
      color: "#ff0000",
      fontFamily: "Inter, sans-serif",
    });
    expect(s.fontSize).toBe(64);
    expect(s.color).toBe("#ff0000");
    expect(s.fontFamily).toBe("Inter, sans-serif");
    expect(s.stroke.enabled).toBe(true);
  });

  it("prefers nested style", () => {
    const base = defaultTextStyle();
    const s = textStyleFromLegacy({
      fontSize: 10,
      style: { fontSize: 99, stroke: { ...base.stroke, width: 12 } },
    });
    expect(s.fontSize).toBe(99);
    expect(s.stroke.width).toBe(12);
  });
});
