// Spec 111 T018/T019/T021 and Phase 12 (T061): on Open (authoring-track = "adapt")
// the identity-first screens, the remove tool, the feature galleries and the
// character survey leave the walk; the language list, and the Missing letters,
// Upgrades and Documentation pages (only for the problem kinds the baseline
// recorded) join it; the walk ends at Review. Copy's walk is unchanged.

import { describe, expect, it } from "vitest";
import { advance, type AdvanceContext } from "./advance.ts";
import { declaredScreenGates, openHiddenScreens, openMenuScreens, openScreenGates } from "../survey/questions/registry.ts";
import type { DecisionSet } from "../decisions/decisionTypes.ts";
import type { OpenIssueKind } from "../decisions/openIssues.ts";

function ctx(track: "copy" | "adapt" | null, issues?: readonly OpenIssueKind[]): AdvanceContext {
  const decisions =
    track === null
      ? {}
      : ({
          "authoring-track": { id: "authoring-track", value: track, provenance: "asked", step: "t" },
          ...(issues !== undefined
            ? { "open-issues": { id: "open-issues", value: issues, provenance: "derived", step: "open" } }
            : {}),
        } as unknown as DecisionSet);
  return {
    decisions,
    selectedTrack: track,
    identitySupported: true,
    touchSeedSource: null,
    allCharactersImplemented: true,
  };
}

const next = (from: Parameters<typeof advance>[0], track: "copy" | "adapt" | null, issues?: readonly OpenIssueKind[]) =>
  advance(from, undefined, ctx(track, issues)).next;

/** Walk Open from the Languages step to the end, returning every step visited and the final navigation. */
function walkOpen(issues?: readonly OpenIssueKind[]): { steps: string[]; navigate: string | undefined } {
  const c = ctx("adapt", issues);
  const steps = ["open_languages"];
  let current: Parameters<typeof advance>[0] = "open_languages";
  for (let guard = 0; guard < 30; guard++) {
    const outcome = advance(current, undefined, c);
    steps.push(outcome.next);
    if (outcome.next === "done") return { steps, navigate: outcome.navigate };
    current = outcome.next;
  }
  throw new Error("Open walk did not terminate");
}

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

  it("show Missing letters and Upgrades only on Open and only for the recorded problem kind", () => {
    const missing = declaredScreenGates.get("open_missing_letters")!;
    const upgrades = declaredScreenGates.get("open_upgrades")!;
    expect(missing(ctx("adapt", ["missing-letters"]).decisions)).toBe(true);
    expect(missing(ctx("adapt", ["upgrades", "docs"]).decisions)).toBe(false);
    // No recorded decision (baseline not taken yet): the pages stay hidden.
    expect(missing(ctx("adapt").decisions)).toBe(false);
    expect(upgrades(ctx("adapt", ["upgrades"]).decisions)).toBe(true);
    expect(upgrades(ctx("adapt", ["missing-letters"]).decisions)).toBe(false);
    expect(upgrades(ctx("adapt").decisions)).toBe(false);
    // Copy never shows them, whatever is recorded.
    expect(missing(ctx("copy", ["missing-letters"]).decisions)).toBe(false);
    expect(upgrades(ctx("copy", ["upgrades"]).decisions)).toBe(false);
  });

  it("menu screens are all hidden-on-Open screens", () => {
    for (const id of openMenuScreens) expect(openHiddenScreens.has(id), id).toBe(true);
  });
});

describe("advance", () => {
  it("Open: attribution goes to the language list; the character survey and the galleries are skipped", () => {
    expect(next("attribution", "adapt")).toBe("open_languages");
    expect(next("open_languages", "adapt")).toBe("osk");
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

describe("the Open walk (spec 111 FR-031, FR-032)", () => {
  it("a keyboard with no problems: Languages, On-screen keyboard, Touch, CSS, then Review", () => {
    expect(walkOpen([])).toEqual({
      steps: ["open_languages", "osk", "touch", "css", "done"],
      navigate: "criteria",
    });
  });

  it("before the baseline is recorded the conditional pages are skipped", () => {
    expect(walkOpen().steps).not.toContain("open_missing_letters");
    expect(walkOpen().steps).not.toContain("open_upgrades");
  });

  it("missing letters adds the Missing letters page", () => {
    expect(walkOpen(["missing-letters"]).steps).toEqual([
      "open_languages", "open_missing_letters", "osk", "touch", "css", "done",
    ]);
  });

  it("a failing upgrade adds the Upgrades page", () => {
    expect(walkOpen(["upgrades"]).steps).toEqual(["open_languages", "open_upgrades", "osk", "touch", "css", "done"]);
  });

  it("documentation problems add the help and welcome-page steps", () => {
    expect(walkOpen(["docs"]).steps).toEqual(["open_languages", "osk", "touch", "css", "help", "html", "done"]);
  });

  it("every problem kind: Languages, Missing letters, Upgrades, OSK, Touch, CSS, Documentation, Review", () => {
    expect(walkOpen(["missing-letters", "upgrades", "docs"])).toEqual({
      steps: ["open_languages", "open_missing_letters", "open_upgrades", "osk", "touch", "css", "help", "html", "done"],
      navigate: "criteria",
    });
  });

  it("an Add that left for the mechanisms gallery returns to Missing letters, not past Upgrades", () => {
    expect(next("mechanisms", "adapt", ["missing-letters", "upgrades"])).toBe("open_missing_letters");
    expect(next("mechanisms", "adapt", ["upgrades"])).toBe("osk");
    expect(next("mechanisms", "copy")).toBe("osk");
  });

  it("help does not hold Open on unfinished letters", () => {
    const stuck = { ...ctx("adapt", ["docs"]), allCharactersImplemented: false };
    expect(advance("help", undefined, stuck).next).toBe("html");
    const copyStuck = { ...ctx("copy"), allCharactersImplemented: false };
    expect(advance("help", undefined, copyStuck).next).toBe("help");
  });

  it("Copy still ends at Output", () => {
    const outcome = advance("html", undefined, ctx("copy"));
    expect(outcome).toEqual({ next: "done", navigate: "output" });
  });
});
