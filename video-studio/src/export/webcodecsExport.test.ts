import { describe, expect, it } from "vitest";
import { createFramePlan, evenDimension } from "./webcodecsExport";

describe("evenDimension", () => {
  it("rounds odd dimensions down to H.264-safe even integers", () => {
    expect(evenDimension(1920)).toBe(1920);
    expect(evenDimension(1081)).toBe(1080);
    expect(evenDimension(1)).toBe(2);
  });
});

describe("createFramePlan", () => {
  it("produces deterministic CFR timestamps independent of wall clock", () => {
    const plan = createFramePlan(2, 30);
    expect(plan).toHaveLength(60);
    expect(plan[0]!.timestampUs).toBe(0);
    expect(plan[0]!.keyFrame).toBe(true);
    expect(plan[30]!.timeSec).toBeCloseTo(1, 5);
    expect(plan[30]!.timestampUs).toBe(1_000_000);
    expect(plan[59]!.timeSec).toBeLessThan(2);
  });
});
