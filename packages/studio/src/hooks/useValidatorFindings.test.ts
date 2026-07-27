// useValidatorFindings — focused unit test.
//
// Proves:
//   1. Hook returns buildFindingsByQuestionId(seeded findings) when the store
//      has validator findings.
//   2. Hook returns {} when the store has no findings (empty array).
//   3. The returned record updates when the store's validatorFindings change.
//
// Strategy: seed workingCopyStore.validatorFindings directly via setState,
// render the hook via renderHook, assert the output matches the result of
// calling buildFindingsByQuestionId with the seeded data.
// buildFindingsByQuestionId is imported from the SAME lint/lintToQuestion.ts
// path the hook uses — so the result is the canonical ground truth.

import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { LintFinding } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { buildFindingsByQuestionId } from "../lint/lintToQuestion.ts";
import { useValidatorFindings } from "./useValidatorFindings.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  useWorkingCopyStore.setState({ validatorFindings: [] });
}

// A finding that maps to at least one question ID (pb_standard_letters).
const INVENTORY_FINDING: LintFinding = {
  code: "KM_LINT_INVENTORY_UNCOVERED",
  severity: "error",
  layer: "A",
  message: "character not covered",
};

// A finding that maps to the identity question (language_name_english).
const DISPLAY_NAME_FINDING: LintFinding = {
  code: "KM_LINT_DISPLAY_NAME_UNDERSCORE",
  severity: "warning",
  layer: "C",
  message: "display name contains underscore",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useValidatorFindings", () => {
  afterEach(() => {
    resetStore();
  });

  it("returns {} when the store has no findings (empty array)", () => {
    const { result } = renderHook(() => useValidatorFindings());

    expect(result.current).toEqual({});
  });

  it("returns buildFindingsByQuestionId(seeded) for a mapped finding", () => {
    const findings: LintFinding[] = [INVENTORY_FINDING];

    act(() => {
      useWorkingCopyStore.setState({ validatorFindings: findings });
    });

    const { result } = renderHook(() => useValidatorFindings());

    const expected = buildFindingsByQuestionId(findings);
    expect(result.current).toEqual(expected);
    // Confirm at least one question ID was populated (not empty — ensures
    // the finding actually maps to something).
    expect(Object.keys(result.current).length).toBeGreaterThan(0);
  });

  it("returns the correct projection for multiple findings covering different question IDs", () => {
    const findings: LintFinding[] = [INVENTORY_FINDING, DISPLAY_NAME_FINDING];

    act(() => {
      useWorkingCopyStore.setState({ validatorFindings: findings });
    });

    const { result } = renderHook(() => useValidatorFindings());

    const expected = buildFindingsByQuestionId(findings);
    expect(result.current).toEqual(expected);
    // pb_standard_letters from INVENTORY_FINDING
    expect(result.current["pb_standard_letters"]).toHaveLength(1);
    // language_name_english from DISPLAY_NAME_FINDING
    expect(result.current["language_name_english"]).toHaveLength(1);
  });

  it("updates when validatorFindings changes in the store", () => {
    const { result } = renderHook(() => useValidatorFindings());

    // Initially empty.
    expect(result.current).toEqual({});

    // Seed a finding.
    act(() => {
      useWorkingCopyStore.setState({ validatorFindings: [INVENTORY_FINDING] });
    });

    const expected = buildFindingsByQuestionId([INVENTORY_FINDING]);
    expect(result.current).toEqual(expected);

    // Clear findings — should return {} again.
    act(() => {
      useWorkingCopyStore.setState({ validatorFindings: [] });
    });

    expect(result.current).toEqual({});
  });
});
