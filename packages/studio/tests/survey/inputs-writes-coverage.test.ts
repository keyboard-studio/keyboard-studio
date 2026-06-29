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

  it("registry has exactly 101 modules (floor guard — accidental deletions fail here)", () => {
    expect(Object.keys(questionRegistry).length).toBe(101);
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
