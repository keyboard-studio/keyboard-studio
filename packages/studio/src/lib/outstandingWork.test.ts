// outstandingWork — the one derivation of what a section still owes (spec 061
// FR-009…FR-016).
//
// These are the four cases the spec's Test surface names, and each is here
// because a rendered-tree test could not pin it cheaply:
//
//   FR-013 — the RESTORED DRAFT. Within-step walks are session-scoped, so after
//     a reload the walk map is empty. An absent walk must never read as
//     completeness: coverage comes from the working copy instead. This is the
//     case D-3 hid, because `clearStepWalk` has no production caller and a stale
//     walk therefore always happened to survive in a live session.
//   FR-018 / SC-005 — the nudge names the manifest-EARLIEST owed section behind
//     the author, and never the one they are standing in.
//   FR-014 / A3 — a character marked for later review still counts. The proof is
//     structural: this derivation reads the RAW `InventoryCoverageGate`, so the
//     mark-aware `accountedForGate` composed over it can report unblocked while
//     this still reports the letter as owed.
//   FR-007 — an unanswered OPTIONAL stop contributes nothing.

import { describe, it, expect } from "vitest";
import { manifest } from "../steps/manifest.ts";
import { accountedForGate } from "./accountedForGate.ts";
import { charToPositionToken } from "./stepWalk.ts";
import type { StepWalkMap } from "./stepWalk.ts";
import type { InventoryCoverageGate } from "./unimplementedInventory.ts";
import { outstandingWork, type OutstandingWorkInputs } from "./outstandingWork.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CLEAN_GATE: InventoryCoverageGate = {
  unimplementedDesktop: [],
  unimplementedTouch: [],
  blockedOnDesktop: false,
  blockedOnTouch: false,
  touchLayoutCorrupted: false,
  blocked: false,
};

function gate(overrides: Partial<InventoryCoverageGate>): InventoryCoverageGate {
  const merged = { ...CLEAN_GATE, ...overrides };
  return { ...merged, blocked: merged.blockedOnDesktop || merged.blockedOnTouch };
}

/** Labels are injected, so the pure module has no i18n dependency — a test can
 * therefore assert on a label without loading a catalog. */
function label(stepId: string): string {
  return `label:${stepId}`;
}

function inputs(overrides: Partial<OutstandingWorkInputs>): OutstandingWorkInputs {
  return {
    coverage: CLEAN_GATE,
    manifest,
    walks: {},
    activeStepId: "identity",
    visited: [],
    label,
    ...overrides,
  };
}

/** Every step the author walked to reach `mechanisms`, in manifest order. */
const WALKED_TO_MECHANISMS = [
  "identity",
  "choose_base",
  "track",
  "characters",
  "marks",
  "convenience",
  "carve",
  "mechanisms",
];

// ---------------------------------------------------------------------------

describe("outstandingWork", () => {
  it("is total: an empty walk map, an empty visited list and a terminal step id all return cleanly", () => {
    const result = outstandingWork(inputs({ activeStepId: "done" }));

    expect(result.sections).toEqual([]);
    expect(result.byStepId.size).toBe(0);
    expect(result.nudgeTarget).toBeNull();
  });

  // FR-013 — the reload case. No walk has been published this session at all.
  it("reports BOTH galleries from coverage alone, with an empty walk map (the restored-draft case)", () => {
    const result = outstandingWork(
      inputs({
        walks: {},
        coverage: gate({
          unimplementedDesktop: ["á", "é"],
          unimplementedTouch: ["á"],
          blockedOnDesktop: true,
          blockedOnTouch: true,
        }),
        activeStepId: "help",
        visited: [...WALKED_TO_MECHANISMS, "touch", "help"],
      }),
    );

    expect(result.sections.map((s) => s.stepId)).toEqual(["mechanisms", "touch"]);
    expect(result.byStepId.get("mechanisms")?.count).toBe(2);
    expect(result.byStepId.get("touch")?.count).toBe(1);
  });

  it("names the step with no question, so arrival hands off to the section's own navigation", () => {
    const result = outstandingWork(
      inputs({
        coverage: gate({ unimplementedDesktop: ["á"], blockedOnDesktop: true }),
      }),
    );

    expect(result.sections[0]?.location).toEqual({ route: "survey", step: "mechanisms" });
    expect(result.sections[0]?.label).toBe("label:mechanisms");
  });

  it("omits a section that owes nothing rather than listing it with a count of 0", () => {
    const result = outstandingWork(
      inputs({
        walks: { marks: [{ id: "marks_attachment", done: true, required: true }] },
      }),
    );

    expect(result.sections).toEqual([]);
    expect(result.byStepId.has("marks")).toBe(false);
  });

  // FR-010: characters AND unanswered required stops, summed.
  it("sums uncovered characters and unanswered required stops", () => {
    const result = outstandingWork(
      inputs({
        coverage: gate({ unimplementedDesktop: ["á", "é", "í"], blockedOnDesktop: true }),
        walks: {
          marks: [
            { id: "marks_attachment", done: true, required: true },
            { id: "marks_treatment", done: false, required: true },
          ],
        },
      }),
    );

    expect(result.byStepId.get("marks")?.count).toBe(1);
    expect(result.byStepId.get("mechanisms")?.count).toBe(3);
  });

  // FR-012/FR-013: a gallery's own published character walk must not be counted
  // a second time on top of the coverage gate.
  it("does not double-count a gallery's characters when its walk IS published", () => {
    const result = outstandingWork(
      inputs({
        coverage: gate({ unimplementedDesktop: ["á", "é"], blockedOnDesktop: true }),
        walks: {
          mechanisms: [
            { id: charToPositionToken("á"), done: false, required: true },
            { id: charToPositionToken("é"), done: false, required: true },
          ] as StepWalkMap["mechanisms"],
        },
      }),
    );

    expect(result.byStepId.get("mechanisms")?.count).toBe(2);
  });

  // FR-007 — scenario 5: a deliberately-skipped optional question.
  it("ignores an unanswered OPTIONAL stop", () => {
    const result = outstandingWork(
      inputs({
        walks: {
          characters: [
            { id: "il_language_english", done: true, required: true },
            { id: "some_optional_question", done: false },
            { id: "explicitly_optional_question", done: false, required: false },
          ],
        },
      }),
    );

    expect(result.sections).toEqual([]);
  });

  describe("nudgeTarget", () => {
    // SC-005 — several owed, exactly one named, and it is the earliest.
    it("picks the manifest-earliest owed section when several are owed", () => {
      const result = outstandingWork(
        inputs({
          coverage: gate({
            unimplementedDesktop: ["á"],
            unimplementedTouch: ["é"],
            blockedOnDesktop: true,
            blockedOnTouch: true,
          }),
          walks: { marks: [{ id: "marks_treatment", done: false, required: true }] },
          activeStepId: "help",
          visited: [...WALKED_TO_MECHANISMS, "touch", "help"],
        }),
      );

      expect(result.sections.map((s) => s.stepId)).toEqual(["marks", "mechanisms", "touch"]);
      // `marks` is earlier than either gallery in the manifest, so it wins —
      // not the gallery most recently visited.
      expect(result.nudgeTarget?.stepId).toBe("marks");
    });

    // FR-018 — the section being worked in is excluded.
    it("is null when the only owed section is the one the author is standing in", () => {
      const result = outstandingWork(
        inputs({
          coverage: gate({ unimplementedDesktop: ["á"], blockedOnDesktop: true }),
          activeStepId: "mechanisms",
          visited: WALKED_TO_MECHANISMS,
        }),
      );

      expect(result.byStepId.has("mechanisms")).toBe(true);
      expect(result.nudgeTarget).toBeNull();
    });

    // FR-018 — anything ahead is excluded too.
    it("ignores a section ahead of the author, even when it owes work", () => {
      const result = outstandingWork(
        inputs({
          coverage: gate({
            unimplementedDesktop: ["á"],
            unimplementedTouch: ["é"],
            blockedOnDesktop: true,
            blockedOnTouch: true,
          }),
          activeStepId: "mechanisms",
          visited: WALKED_TO_MECHANISMS,
        }),
      );

      // `touch` is ahead and unvisited; `mechanisms` is the current section.
      expect(result.sections.map((s) => s.stepId)).toEqual(["mechanisms", "touch"]);
      expect(result.nudgeTarget).toBeNull();
    });

    it("names a section behind the author once they have moved past it", () => {
      const result = outstandingWork(
        inputs({
          coverage: gate({ unimplementedDesktop: ["á"], blockedOnDesktop: true }),
          activeStepId: "touch",
          visited: [...WALKED_TO_MECHANISMS, "touch"],
        }),
      );

      expect(result.nudgeTarget?.stepId).toBe("mechanisms");
      expect(result.nudgeTarget?.count).toBe(1);
      // Always a member of `sections`, never a synthesized extra.
      expect(result.sections).toContain(result.nudgeTarget);
    });

    // The walk is over (#output). Every visited section is behind the author.
    it("still names an owed section at a terminal position", () => {
      const result = outstandingWork(
        inputs({
          coverage: gate({ unimplementedDesktop: ["á"], blockedOnDesktop: true }),
          activeStepId: "done",
          visited: [...WALKED_TO_MECHANISMS, "touch", "help"],
        }),
      );

      expect(result.nudgeTarget?.stepId).toBe("mechanisms");
    });

    it("never names a section the author has not actually walked", () => {
      const result = outstandingWork(
        inputs({
          coverage: gate({ unimplementedDesktop: ["á"], blockedOnDesktop: true }),
          activeStepId: "done",
          visited: [],
        }),
      );

      expect(result.byStepId.has("mechanisms")).toBe(true);
      expect(result.nudgeTarget).toBeNull();
    });
  });

  // FR-014 / A3 — "mark for later review" DEFERS a letter, it does not
  // discharge it. Asserted against the mark-aware gate to make the difference
  // explicit: the same letter is unblocked THERE and still owed HERE.
  describe("marked for later review (FR-014 / A3)", () => {
    it("still counts a marked character, even though accountedForGate reports unblocked", () => {
      const raw = gate({ unimplementedDesktop: ["á"], blockedOnDesktop: true });
      const marked = accountedForGate(raw, new Set(["á"]), new Set());

      // The gallery's own completion control is relaxed …
      expect(marked.blocked).toBe(false);
      expect(marked.unaccountedDesktop).toEqual([]);

      // … while the row and the nudge still report the letter as owed.
      const result = outstandingWork(
        inputs({
          coverage: raw,
          activeStepId: "touch",
          visited: [...WALKED_TO_MECHANISMS, "touch"],
        }),
      );

      expect(result.byStepId.get("mechanisms")?.count).toBe(1);
      expect(result.nudgeTarget?.stepId).toBe("mechanisms");
    });
  });

  // FR-035 — the fail-closed corrupted-touch carve-out passes through
  // unchanged: the gate reports the full touch inventory, and so does this.
  it("passes a corrupted touch layout's fail-closed count straight through", () => {
    const result = outstandingWork(
      inputs({
        coverage: gate({
          unimplementedTouch: ["á", "é", "í"],
          blockedOnTouch: true,
          touchLayoutCorrupted: true,
        }),
        activeStepId: "help",
        visited: [...WALKED_TO_MECHANISMS, "touch", "help"],
      }),
    );

    expect(result.byStepId.get("touch")?.count).toBe(3);
    expect(result.nudgeTarget?.stepId).toBe("touch");
  });
});
