import { describe, expect, it } from "vitest";
import { createHistory, pushHistory, redo, undo } from "./history";
import { makeProject } from "../types/document";

describe("history", () => {
  it("push / undo / redo", () => {
    const p0 = makeProject({ name: "v0" });
    const p1 = makeProject({ name: "v1" });
    const p2 = makeProject({ name: "v2" });

    let hist = createHistory();
    hist = pushHistory(hist, p0);
    hist = pushHistory(hist, p1);

    let current = p2;
    const u1 = undo(hist, current);
    expect(u1?.state.name).toBe("v1");
    hist = u1!.hist;
    current = u1!.state;

    const u2 = undo(hist, current);
    expect(u2?.state.name).toBe("v0");
    hist = u2!.hist;
    current = u2!.state;

    const r1 = redo(hist, current);
    expect(r1?.state.name).toBe("v1");
  });

  it("returns null when stack empty", () => {
    expect(undo(createHistory(), makeProject())).toBeNull();
    expect(redo(createHistory(), makeProject())).toBeNull();
  });
});
