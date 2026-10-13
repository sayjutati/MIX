import { describe, expect, it } from "vitest";
import { DEFAULT_INSTRUMENTS, makeTrack } from "../types/project";
import { colorForKind, kindsForRole, resolveTrackRole, roleOfKind, tracksInRole } from "./laneRole";

describe("laneRole", () => {
  it("maps drum pieces to perc and bass kinds to bass", () => {
    expect(roleOfKind("kick")).toBe("perc");
    expect(roleOfKind("snare")).toBe("perc");
    expect(roleOfKind("crash")).toBe("perc");
    expect(roleOfKind("bass")).toBe("bass");
    expect(roleOfKind("bass808")).toBe("bass");
    expect(roleOfKind("piano")).toBe("melody");
    expect(roleOfKind("voice")).toBe("melody");
  });

  it("lists only role-matching kinds", () => {
    expect(kindsForRole("perc")).toContain("snare");
    expect(kindsForRole("perc")).not.toContain("piano");
    expect(kindsForRole("bass")).toEqual(["bass", "bass808"]);
    expect(kindsForRole("melody")).toContain("piano");
    expect(kindsForRole("melody")).not.toContain("kick");
  });

  it("resolves stored role first, then instrument kind", () => {
    const kick = DEFAULT_INSTRUMENTS.find((i) => i.id === "inst-kick")!;
    const t = makeTrack({ instrumentId: "inst-kick" });
    expect(resolveTrackRole(t, [kick])).toBe("perc");
    expect(resolveTrackRole({ ...t, role: "melody" }, [kick])).toBe("melody");
  });

  it("groups tracks by role", () => {
    const tracks = [
      makeTrack({ id: "a", instrumentId: "inst-kick", role: "perc" }),
      makeTrack({ id: "b", instrumentId: "inst-bass", role: "bass" }),
      makeTrack({ id: "c", instrumentId: "inst-piano", role: "melody" }),
    ];
    expect(tracksInRole(tracks, DEFAULT_INSTRUMENTS, "perc").map((t) => t.id)).toEqual(["a"]);
  });

  it("gives kick and snare different colors", () => {
    expect(colorForKind("kick", "#000")).not.toBe(colorForKind("snare", "#000"));
  });
});
