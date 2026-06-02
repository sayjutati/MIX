import { describe, expect, it } from "vitest";
import { createHistory, pushHistory, redo, undo } from "./history";
import { initialEditorState } from "./types";

describe("history", () => {
  it("undo restores previous state", () => {
    const s0 = initialEditorState();
    const s1 = { ...s0, title: "changed" };
    let hist = createHistory();
    hist = pushHistory(hist, s0);
    const r = undo(hist, s1);
    expect(r?.state.title).toBe("無題のプロジェクト");
  });

  it("redo reapplies undone state", () => {
    const s0 = initialEditorState();
    const s1 = { ...s0, title: "changed" };
    let hist = pushHistory(createHistory(), s0);
    const u = undo(hist, s1)!;
    const r = redo(u.hist, u.state)!;
    expect(r.state.title).toBe("changed");
  });
});
