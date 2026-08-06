// progressDots — the ROW'S COMPOSITION, pinned against the real manifest
// (spec 061 SC-008; closes D-8).
//
// WHY THIS FILE EXISTS SEPARATELY FROM progressDots.test.ts. D-8 is not "a test
// was missing", it is "every test that touched this was a subset matcher". The
// shell-level assertion checked `querySelectorAll("[data-progress-dot-kind]")
// .length > 0` — which passes with a SINGLE mark, and a single mark relabelling
// itself as the author moved through five stages IS the reported defect. The
// unit-level upcoming assertions used `arrayContaining` / `not.toContain`, which
// pin no count either.
//
// So the assertions here are deliberately of one shape: an EXACT, ORDERED match
// of the full `(step, kind)` sequence. Not a subset. Not a minimum count. Not a
// snapshot — a snapshot absorbs a regression the moment someone runs `-u`, which
// is how a subset matcher fails in slow motion.
//
// Reading a failure: the expected arrays below are the journey as the author
// walked it. If one changes, either the manifest changed (in which case update
// it deliberately, and check SC-001 still holds) or a mark was lost or
// duplicated — which is the defect class this file guards.

import { describe, it, expect } from "vitest";
import type { DecisionRecord } from "@keyboard-studio/contracts";
import { manifest } from "../steps/manifest.ts";
import type { TraversalSnapshot } from "../stores/surveySessionStore.ts";
import type { ResolveContext } from "../lib/resolveLocation.ts";
import { charToPositionToken, positionTokenToChar } from "../lib/stepWalk.ts";
import type { StepWalkMap } from "../lib/stepWalk.ts";
import type { OutstandingSection } from "../lib/outstandingWork.ts";
import { buildProgressDots, type ProgressDot } from "./progressDots.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_RECORD: DecisionRecord = {
  format: "keyboard-studio.decision-record",
  version: 2,
  keyboardId: "test_kbd",
  entries: [],
  truncated: null,
};

function traversal(partial: {
  activeStepId: string;
  history?: readonly string[];
  visited?: readonly string[];
  selectedTrack?: "copy" | "adapt" | null;
}): TraversalSnapshot {
  return {
    activeStepId: partial.activeStepId,
    history: partial.history ?? [],
    // `visited` is the load-bearing reachability term (resolveLocation's
    // `isReached`), so it defaults to the walked history plus where they are —
    // the same normalization surveySessionStore's own `normalizeVisited` does.
    visited: partial.visited ?? [...(partial.history ?? []), partial.activeStepId],
    selectedTrack: partial.selectedTrack ?? null,
  } as unknown as TraversalSnapshot;
}

/** The adapt track's spine up to (not including) `stepId`. `project_name` is
 * off-track for adapt and never walked. */
const ADAPT_SPINE = [
  "identity",
  "choose_base",
  "track",
  "characters",
  "marks",
  "convenience",
  "carve",
  "mechanisms",
  "touch",
  "help",
] as const;

function walkedTo(stepId: string): readonly string[] {
  const index = ADAPT_SPINE.indexOf(stepId as (typeof ADAPT_SPINE)[number]);
  return ADAPT_SPINE.slice(0, index === -1 ? ADAPT_SPINE.length : index);
}

function ctxAt(
  activeStepId: string,
  overrides: {
    history?: readonly string[];
    visited?: readonly string[];
    selectedTrack?: "copy" | "adapt" | null;
    stepPositions?: Readonly<Record<string, readonly string[]>>;
  } = {},
): ResolveContext {
  return {
    manifest,
    questionRegistry: {},
    traversal: traversal({
      activeStepId,
      history: overrides.history ?? walkedTo(activeStepId),
      ...(overrides.visited !== undefined ? { visited: overrides.visited } : {}),
      selectedTrack: overrides.selectedTrack ?? "adapt",
    }),
    hasProject: true,
    ...(overrides.stepPositions !== undefined ? { stepPositions: overrides.stepPositions } : {}),
  };
}

/** The row as `(step, kind)` pairs — the whole assertion surface of this file. */
function row(dots: readonly ProgressDot[]): string[] {
  return dots.map((d) => `${d.location.step ?? "-"}:${d.kind}`);
}

function outstanding(
  entries: readonly { readonly stepId: string; readonly count: number }[],
): ReadonlyMap<string, OutstandingSection> {
  return new Map(
    entries.map((e) => [
      e.stepId,
      {
        stepId: e.stepId,
        count: e.count,
        location: { route: "survey" as const, step: e.stepId as "marks" },
        label: `label:${e.stepId}`,
      },
    ]),
  );
}

/** A gallery's character walk, as `useCharWalkPosition` publishes it. */
function charWalk(chars: readonly string[], done: (char: string) => boolean): StepWalkMap[string] {
  return chars.map((char) => ({
    id: charToPositionToken(char),
    label: `${char}`,
    done: done(char),
    required: true,
  }));
}

// ---------------------------------------------------------------------------

describe("the row against the real manifest (SC-008)", () => {
  // SC-001 — the reported defect, stated as an exact sequence. Every section on
  // the author's path up to and including the gallery they are standing in has
  // exactly one mark: none missing (D-1/D-2), none duplicated.
  it("is an exact ordered match, one mark per passed section, standing in the Mechanism gallery", () => {
    const dots = buildProgressDots({
      record: EMPTY_RECORD,
      ctx: ctxAt("mechanisms"),
    });

    expect(row(dots)).toEqual([
      "identity:completed",
      "choose_base:completed",
      "track:completed",
      // project_name is spine:false and off-track for adapt — absent, not greyed
      // out (FR-003).
      "characters:completed",
      "marks:completed",
      "convenience:completed",
      "carve:completed",
      "mechanisms:current",
      // touch_seed_source and touch are ahead; help is ahead; package never
      // earns a mark at all.
      "touch_seed_source:upcoming",
      "touch:upcoming",
      "help:upcoming",
    ]);
  });

  // FR-003 — a bypassed side trail contributes NO mark, before or after the
  // author's position. Two shapes of bypass, both covered: off-track
  // (`project_name` on adapt) and hopped-over off-spine (`touch_seed_source`).
  it("gives a bypassed side trail no mark once the author is past its position", () => {
    const dots = buildProgressDots({
      record: EMPTY_RECORD,
      // Walked mechanisms -> touch directly: the seed-source fork was skipped, so
      // it is in neither `history` nor `visited`.
      ctx: ctxAt("help", {
        history: ["identity", "choose_base", "track", "characters", "marks", "convenience", "carve", "mechanisms", "touch"],
      }),
    });

    expect(row(dots)).toEqual([
      "identity:completed",
      "choose_base:completed",
      "track:completed",
      "characters:completed",
      "marks:completed",
      "convenience:completed",
      "carve:completed",
      "mechanisms:completed",
      "touch:completed",
      "help:current",
    ]);
    expect(row(dots)).not.toContain("touch_seed_source:completed");
    expect(row(dots)).not.toContain("touch_seed_source:upcoming");
    expect(row(dots)).not.toContain("project_name:upcoming");
  });

  it("includes a side trail the track DOES walk, in manifest position", () => {
    const dots = buildProgressDots({
      record: EMPTY_RECORD,
      ctx: ctxAt("characters", {
        history: ["identity", "choose_base", "track", "project_name"],
        selectedTrack: "copy",
      }),
    });

    expect(row(dots)).toEqual([
      "identity:completed",
      "choose_base:completed",
      "track:completed",
      "project_name:completed",
      "characters:current",
      "marks:upcoming",
      "convenience:upcoming",
      "carve:upcoming",
      "mechanisms:upcoming",
      "touch_seed_source:upcoming",
      "touch:upcoming",
      "help:upcoming",
    ]);
  });

  // Edge case: the walk is over. Nothing reads upcoming, and every visited
  // section reads complete — including the marks the pre-061 row dropped
  // entirely, since `aheadStageDot` returned null for a -1 current index.
  it("at a terminal position, every visited section reads complete and nothing reads upcoming", () => {
    const dots = buildProgressDots({
      record: EMPTY_RECORD,
      ctx: ctxAt("done", {
        history: [...ADAPT_SPINE],
        visited: [...ADAPT_SPINE],
      }),
    });

    expect(row(dots)).toEqual([
      "identity:completed",
      "choose_base:completed",
      "track:completed",
      "characters:completed",
      "marks:completed",
      "convenience:completed",
      "carve:completed",
      "mechanisms:completed",
      "touch:completed",
      "help:completed",
    ]);
    expect(dots.some((d) => d.kind === "current")).toBe(false);
    expect(dots.some((d) => d.kind === "upcoming")).toBe(false);
  });

  // SC-003 / FR-004 — one mark per VISIBLE station, not one for the series and
  // not four placeholders.
  it("a marks series with two visible stations yields exactly two marks", () => {
    const walks: StepWalkMap = {
      marks: [
        { id: "marks_attachment", done: true, required: true },
        { id: "marks_treatment", done: true, required: true },
      ],
    };
    const dots = buildProgressDots({
      record: EMPTY_RECORD,
      ctx: ctxAt("marks", { stepPositions: { marks: ["marks_attachment", "marks_treatment"] } }),
      stepWalks: walks,
      stepCursors: { marks: "marks_treatment" },
    });

    const marksDots = dots.filter((d) => d.location.step === "marks");
    expect(marksDots.map((d) => `${d.id}:${d.kind}`)).toEqual([
      "marks_attachment:completed",
      "marks_treatment:current",
    ]);
    // Each station is individually addressable — a `Location` naming it, which
    // is what makes an activated mark restore that station.
    expect(marksDots.map((d) => d.location)).toEqual([
      { route: "survey", step: "marks", question: "marks_attachment" },
      { route: "survey", step: "marks", question: "marks_treatment" },
    ]);
  });

  // SC-002 / FR-033 — per-letter addressing must not return to the row, at any
  // inventory size. The in-page character strip stays the affordance.
  it("addresses no mark to a single letter, whatever the inventory size", () => {
    const inventory = Array.from({ length: 30 }, (_, i) => String.fromCodePoint(0x0101 + i));
    const dots = buildProgressDots({
      record: EMPTY_RECORD,
      ctx: ctxAt("mechanisms"),
      stepWalks: { mechanisms: charWalk(inventory, () => false) },
      stepCursors: { mechanisms: charToPositionToken(inventory[0]!) },
    });

    // FR-005: exactly one mark for the gallery, thirty characters or not.
    expect(dots.filter((d) => d.location.step === "mechanisms")).toHaveLength(1);
    for (const dot of dots) {
      expect(positionTokenToChar(dot.id)).toBeNull();
      expect(dot.location.question).toBeUndefined();
    }
  });

  // FR-006 / FR-008 — a passed section that owes work keeps the EXISTING hollow
  // shape and carries `outstandingCount`; one that owes nothing reads complete.
  // No fourth `kind` (FR-031, Q4).
  describe("a passed section that still owes work", () => {
    it("reads hollow with a count, while the sections around it read complete", () => {
      const dots = buildProgressDots({
        record: EMPTY_RECORD,
        ctx: ctxAt("touch"),
        outstandingByStepId: outstanding([{ stepId: "mechanisms", count: 2 }]),
      });

      expect(row(dots)).toEqual([
        "identity:completed",
        "choose_base:completed",
        "track:completed",
        "characters:completed",
        "marks:completed",
        "convenience:completed",
        "carve:completed",
        "mechanisms:upcoming",
        "touch:current",
        "help:upcoming",
      ]);

      const mechanisms = dots.find((d) => d.location.step === "mechanisms");
      expect(mechanisms?.outstandingCount).toBe(2);
      // The mark AHEAD shares the shape and carries no count — which is what
      // gives the two different accessible names (asserted in
      // StudioFooter.a11y.test.tsx).
      expect(dots.find((d) => d.location.step === "help")?.outstandingCount).toBeUndefined();
    });

    it("keeps kind within the three-member union — no fourth value", () => {
      const dots = buildProgressDots({
        record: EMPTY_RECORD,
        ctx: ctxAt("touch"),
        outstandingByStepId: outstanding([{ stepId: "mechanisms", count: 2 }]),
      });

      for (const dot of dots) {
        expect(["completed", "current", "upcoming"]).toContain(dot.kind);
      }
    });

    // D-3: the gallery's own hollow-behind mark must carry the count too, or it
    // stays nominally identical to a stage not yet reached.
    it("carries the count on a gallery's collapsed walk mark as well", () => {
      const inventory = ["ā", "ē"];
      const dots = buildProgressDots({
        record: EMPTY_RECORD,
        ctx: ctxAt("touch"),
        stepWalks: { mechanisms: charWalk(inventory, () => false) },
        outstandingByStepId: outstanding([{ stepId: "mechanisms", count: 2 }]),
      });

      const mechanisms = dots.find((d) => d.location.step === "mechanisms");
      expect(mechanisms?.kind).toBe("upcoming");
      expect(mechanisms?.outstandingCount).toBe(2);
    });

    it("does not put a count on the section the author is standing in", () => {
      const dots = buildProgressDots({
        record: EMPTY_RECORD,
        ctx: ctxAt("mechanisms"),
        stepWalks: { mechanisms: charWalk(["ā"], () => false) },
        outstandingByStepId: outstanding([{ stepId: "mechanisms", count: 1 }]),
      });

      const mechanisms = dots.find((d) => d.location.step === "mechanisms");
      expect(mechanisms?.kind).toBe("current");
      expect(mechanisms?.outstandingCount).toBeUndefined();
    });
  });
});
