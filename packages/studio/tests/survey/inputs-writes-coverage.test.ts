// T019: inputs/writes coverage gate.
//
// Every registered QuestionModule MUST declare BOTH `inputs` and `writes` as
// present fields (the field must exist; an empty array [] passes, undefined
// fails). A module missing either field causes this spec to fail.
//
// Rationale: spec §010 FR-006 / G7 — explicit empty arrays are required for
// questions that read/write nothing so that the dashboard and orphan-input lint
// can distinguish "intentionally no dependency" from "not yet declared".

import { describe, it, expect } from "vitest";
import { questionRegistry } from "../../src/survey/questions/registry.ts";

describe("inputs/writes coverage gate — every registered module declares both fields", () => {
  it("registry is non-empty (sanity)", () => {
    expect(Object.keys(questionRegistry).length).toBeGreaterThan(0);
  });

  it("registry has at least 97 modules (floor guard — accidental deletions fail here)", () => {
    // Floor guard, not an exact count: the registry grows as questions are
    // added, so a literal `=== N` went red on every legitimate addition.
    // 102 at spec-034 lock, minus the five marks questions RETIRED by spec 046
    // (pb_accent_marks_gate, pb_diacritic_select, pb_stacking_marks,
    // pb_mark_style, pb_capitals_marks — superseded by the marks series) = 97.
    expect(Object.keys(questionRegistry).length).toBeGreaterThanOrEqual(97);
  });

  for (const [id, mod] of Object.entries(questionRegistry)) {
    it(`${id}: inputs field is present (not undefined)`, () => {
      expect(
        mod.inputs,
        `Module '${id}' is missing the 'inputs' field.\n` +
          `Add 'export const inputs: readonly IRPath[] = [];' to the module and ` +
          `include 'inputs' in the default export object.`,
      ).not.toBeUndefined();
    });

    it(`${id}: writes field is present (not undefined)`, () => {
      expect(
        mod.writes,
        `Module '${id}' is missing the 'writes' field.\n` +
          `Add 'export const writes: readonly IRPath[] = [];' to the module and ` +
          `include 'writes' in the default export object.`,
      ).not.toBeUndefined();
    });
  }
});
