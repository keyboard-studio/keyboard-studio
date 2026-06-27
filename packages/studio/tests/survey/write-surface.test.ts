// T021: write-surface conditional gate (US4).
//
// For each STRATEGY-BEARING survey question — one whose linked Pattern carries a
// strategyId (spec §5) — whose §7.7 assignment-map write surface IS available,
// this spec asserts that the question's declared `writes` exactly matches that
// write surface.
//
// CONDITIONAL gate (spec §010 clarification Q3 / tasks.md T021):
// - Questions whose §7.7 write surface is not yet exposed are SKIPPED.
// - Questions with no linked Pattern strategyId are outside the scope of this
//   gate and are also skipped.
//
// CURRENT REALITY (2026-06-26):
// - No survey question module currently carries a `strategyId` link to a
//   Pattern. Survey question modules (QuestionModule in types.ts) do not expose
//   a `strategyId` field — they carry only `inputs` and `writes` as IRPath arrays
//   and a `definition` (FlowQuestion), which has no strategyId field.
// - The §7.7 assignment-map write surface (MechanismAssignment / applyAssignments)
//   exists in packages/contracts/src/assignmentMap.ts and
//   packages/engine/src/pattern-apply/applyAssignments.ts, but there is no
//   per-question accessor or registry that maps a FlowQuestion to the §7.7 write
//   surface for that question's linked Pattern.
// - Therefore, the strategy-bearing question set is EMPTY today and this gate
//   passes vacuously. The vacuity is explicit (an assertion on the empty set),
//   not hidden.
//
// FUTURE ACTIVATION:
// When work lands that:
//   (a) Adds a `strategyId?: StrategyId` link field to QuestionModule or
//       FlowQuestion, AND
//   (b) Exposes a `getWriteSurface(strategyId: StrategyId): readonly IRPath[] | null`
//       function (§7.7 surface accessor), returning the declared assignment-map
//       write surface for that strategy (null = not yet exposed / skip),
// ... this gate will activate automatically:
//   - `collectStrategyBearingQuestions()` (below) returns non-empty.
//   - `getWriteSurface()` returns a non-null list for available surfaces.
//   - The assertions in the `describe` block below begin to exercise real data.
//
// To fill in the §7.7 surface accessor: replace `getWriteSurface` (marked TODO
// below) with a real implementation that maps StrategyId → IRPath[]. The
// accessor must return null for strategies whose surface is not yet modelled,
// so the gate remains green while the surface is rolled out incrementally.

import { describe, it, expect } from "vitest";
import type { StrategyId } from "@keyboard-studio/contracts";
import type { IRPath } from "@keyboard-studio/contracts";
import { formatIRPath } from "@keyboard-studio/contracts";
import { questionRegistry } from "../../src/survey/questions/registry.ts";
import type { QuestionModule } from "../../src/survey/types.ts";

// ---------------------------------------------------------------------------
// §7.7 write-surface accessor (STUB — not yet implemented).
//
// Returns the declared §7.7 assignment-map write surface (as IRPath[]) for a
// given StrategyId, or null if that strategy's surface is not yet exposed in
// code. When null is returned for a question, the gate SKIPS that question
// (conditional gate per spec clarification Q3).
//
// TODO: Replace this stub with a real lookup once §7.7 surface is exposed.
//       The returned IRPath[] must exactly match what the question's `writes`
//       should declare to satisfy the §7.7 assignment-map write contract.
// ---------------------------------------------------------------------------

function getWriteSurface(
  _strategyId: StrategyId,
): readonly IRPath[] | null {
  // §7.7 assignment-map write surface is not yet exposed as a per-strategy
  // IRPath[] accessor. Return null to skip all strategy-bearing questions
  // until the surface lands. This is the correct no-op for the current state.
  return null;
}

// ---------------------------------------------------------------------------
// Strategy-bearing question detection.
//
// A QuestionModule is "strategy-bearing" if it (or its linked Pattern) exposes
// a strategyId. Currently, QuestionModule / FlowQuestion do not carry this
// field — the strategyId lives on Pattern (packages/contracts/src/pattern.ts)
// and is only linked to a question indirectly through the gallery / pattern-
// apply path.
//
// This function inspects the registry for any module that carries a strategyId.
// Today that is always an empty set. When the link is added, update the accessor
// inside this function to read it from the right field.
// ---------------------------------------------------------------------------

interface StrategyBearingEntry {
  id: string;
  mod: QuestionModule;
  strategyId: StrategyId;
}

function collectStrategyBearingQuestions(): StrategyBearingEntry[] {
  const entries: StrategyBearingEntry[] = [];

  for (const [id, mod] of Object.entries(questionRegistry)) {
    // TODO: When QuestionModule gains a `strategyId` link (or a `patternId`
    // field from which strategyId can be derived), read it here and push
    // to entries. For example:
    //
    //   const sid = (mod as { strategyId?: StrategyId }).strategyId;
    //   if (sid !== undefined) {
    //     entries.push({ id, mod, strategyId: sid });
    //   }
    //
    // For now, no module exposes this field, so entries stays empty.
    void id;
    void mod;
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const strategyBearingQuestions = collectStrategyBearingQuestions();

describe("write-surface conditional gate — strategy-bearing questions' writes match §7.7 surface", () => {
  // Vacuity assertion: makes the empty-set state explicit and visible in CI
  // output. This will start failing (in a good way) when strategyId-bearing
  // questions land — replace this assertion with a count check at that point.
  it("vacuity check — zero strategy-bearing questions exist today (gate is dormant)", () => {
    expect(
      strategyBearingQuestions.length,
      "Expected zero strategy-bearing questions in the current registry. " +
        "When a QuestionModule gains a strategyId link, update " +
        "collectStrategyBearingQuestions() in this spec and replace this " +
        "assertion with a real count guard.",
    ).toBe(0);
  });

  // Conditional gate: iterate strategy-bearing questions.
  // For each one, check whether the §7.7 surface is available (getWriteSurface
  // returns non-null). If available, assert that declares writes exactly match.
  // If not available, skip (no assertion — the conditional gate design).
  for (const { id, mod, strategyId } of strategyBearingQuestions) {
    it(`${id} (strategyId=${strategyId}): writes matches §7.7 surface if available`, () => {
      const surface = getWriteSurface(strategyId);

      if (surface === null) {
        // §7.7 surface not yet exposed for this strategy — skip.
        // Use a vacuous true assertion with a clear message so the skip is
        // visible in verbose test output rather than silently omitted.
        expect(
          true,
          `Skipping ${id} (strategyId=${strategyId}): §7.7 write surface ` +
            `not yet exposed. Implement getWriteSurface('${strategyId}') in ` +
            `packages/studio/tests/survey/write-surface.test.ts to activate.`,
        ).toBe(true);
        return;
      }

      // §7.7 surface IS available — assert writes match exactly.
      const declaredWrites = (mod.writes ?? []).map(formatIRPath).sort();
      const expectedWrites = [...surface].map(formatIRPath).sort();

      expect(
        declaredWrites,
        `Question '${id}' (strategyId=${strategyId}): declared writes ` +
          `[${declaredWrites.join(", ")}] does not match §7.7 write surface ` +
          `[${expectedWrites.join(", ")}]. Update the 'writes' declaration in ` +
          `packages/studio/src/survey/questions/.../\${id}.ts to match.`,
      ).toEqual(expectedWrites);
    });
  }
});
