// Spec 111 T018/T019/T021: on Open (authoring-track = "adapt") the identity-first
// screens, the remove tool and the feature galleries leave the walk, the
// language list joins it, and Copy's walk is unchanged.

import { describe, expect, it } from "vitest";
import { advance, type AdvanceContext } from "./advance.ts";
import { declaredScreenGates, openHiddenScreens, openMenuScreens, openScreenGates } from "../survey/questions/registry.ts";
import type { DecisionSet } from "../decisions/decisionTypes.ts";

function ctx(track: "copy" | "adapt" | null): AdvanceContext {
  const decisions =
    track === null
      ? {}
      : ({ "authoring-track": { id: "authoring-track", value: track, provenance: "asked", step: "t" } } as unknown as DecisionSet);
  return {
    decisions,
    selectedTrack: track,
    identitySupported: true,
    touchSeedSource: null,
    allCharactersImplemented: true,
  };
}

const next = (from: Parameters<typeof advance>[0], track: "copy" | "adapt" | null) =>
  advance(from, undefined, ctx(track)).next;

describe("declared gates", () => {
  it("hide every Open-hidden screen on adapt and show it otherwise", () => {
    const adapt = ctx("adapt").decisions;
    for (const id of openHiddenScreens) {
      const gate = openScreenGates.get(id)!;
      expect(gate(adapt), id).toBe(false);
      // The track step also hides on copy: the start screen recorded the track.
      expect(gate(ctx("copy").decisions), id).toBe(id !== "track");
      expect(gate(ctx(null).decisions), id).toBe(true);
    }
  });

  it("show the language screen on adapt only", () => {
    const gate = declaredScreenGates.get("open_languages")!;
    expect(gate(ctx("adapt").decisions)).toBe(true);
    expect(gate(ctx("copy").decisions)).toBe(false);
  });

  it("menu screens are all hidden-on-Open screens", () => {
    for (const id of openMenuScreens) expect(openHiddenScreens.has(id), id).toBe(true);
  });
});

describe("advance", () => {
  it("Open: attribution goes to the language list, then characters; the galleries are skipped", () => {
    expect(next("attribution", "adapt")).toBe("open_languages");
    expect(next("open_languages", "adapt")).toBe("characters");
    expect(next("characters", "adapt")).toBe("osk");
  });

  it("Copy: the walk skips only the track step, which the start screen answered", () => {
    expect(next("identity", "copy")).toBe("layout");
    expect(next("layout", "copy")).toBe("choose_base");
    // The start screen recorded the track, so the track step is skipped.
    expect(next("choose_base", "copy")).toBe("attribution");
    expect(next("choose_base", null)).toBe("track");
    expect(next("attribution", "copy")).toBe("project_name");
    expect(next("project_name", "copy")).toBe("characters");
    expect(next("characters", "copy")).toBe("marks");
    expect(next("carve", "copy")).toBe("deadkeys");
    expect(next("touch", "copy")).toBe("css");
  });
});
