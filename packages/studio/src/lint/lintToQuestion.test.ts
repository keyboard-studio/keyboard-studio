import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { LintFinding } from "@keyboard-studio/contracts";
import { buildFindingsByQuestionId, selectUnmappedFindings } from "./lintToQuestion";
import { LintSummary } from "./LintSummary";
import { VALIDATOR_ERROR_FINDING } from "./validationErrorFindings";

function makeFinding(code: string): LintFinding {
  return { code, severity: "warning", layer: "C", message: "test" };
}

describe("buildFindingsByQuestionId", () => {
  it("returns empty record for empty input", () => {
    expect(buildFindingsByQuestionId([])).toEqual({});
  });

  it("omits findings whose code has no mapping", () => {
    const result = buildFindingsByQuestionId([makeFinding("KM_LINT_STRAY_SCRATCH_FILES")]);
    expect(result).toEqual({});
  });

  it("places a finding under each of its mapped question IDs", () => {
    const finding = makeFinding("KM_LINT_INVENTORY_UNCOVERED");
    const result = buildFindingsByQuestionId([finding]);
    expect(result["pb_standard_letters"]).toEqual([finding]);
    expect(result["pb_special_letters"]).toEqual([finding]);
  });

  it("accumulates multiple findings under the same question ID", () => {
    const f1 = makeFinding("KM_LINT_INVENTORY_UNCOVERED");
    const f2 = makeFinding("KM_LINT_MANDATED_CHAR_MISSING");
    const result = buildFindingsByQuestionId([f1, f2]);
    expect(result["pb_standard_letters"]).toEqual([f1, f2]);
  });

  it("places a display-name finding under language_name_english", () => {
    const finding = makeFinding("KM_LINT_DISPLAY_NAME_UNDERSCORE");
    const result = buildFindingsByQuestionId([finding]);
    expect(result["language_name_english"]).toEqual([finding]);
    expect(Object.keys(result)).toHaveLength(1);
  });

  it("places a region finding under region", () => {
    const finding = makeFinding("KM_LINT_KPS_NUMERIC_REGION_TAG");
    const result = buildFindingsByQuestionId([finding]);
    expect(result["region"]).toEqual([finding]);
    expect(Object.keys(result)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// selectUnmappedFindings — unmapped-findings coverage (swallowed-catch bugfix AC#3)
// ---------------------------------------------------------------------------

describe("selectUnmappedFindings", () => {
  it("returns empty array for empty input", () => {
    expect(selectUnmappedFindings([])).toEqual([]);
  });

  it("EXCLUDES a finding whose code IS present in LINT_CODE_TO_QUESTION_IDS", () => {
    // KM_LINT_INVENTORY_UNCOVERED maps to ["pb_standard_letters","pb_special_letters"]
    const mapped = makeFinding("KM_LINT_INVENTORY_UNCOVERED");
    const result = selectUnmappedFindings([mapped]);
    expect(result).toEqual([]);
  });

  it("EXCLUDES KM_LINT_MANDATED_CHAR_MISSING (mapped to pb_standard_letters)", () => {
    const mapped = makeFinding("KM_LINT_MANDATED_CHAR_MISSING");
    const result = selectUnmappedFindings([mapped]);
    expect(result).toEqual([]);
  });

  it("RETURNS a finding whose code is NOT in LINT_CODE_TO_QUESTION_IDS (unmapped)", () => {
    // KM_WARN_VALIDATOR_ERROR is a synthetic code not in the map.
    const unmapped = makeFinding("KM_WARN_VALIDATOR_ERROR");
    const result = selectUnmappedFindings([unmapped]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(unmapped);
  });

  it("RETURNS KM_WARN_LINT_ERROR (synthetic code, not in the map)", () => {
    const unmapped = makeFinding("KM_WARN_LINT_ERROR");
    const result = selectUnmappedFindings([unmapped]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(unmapped);
  });

  it("RETURNS KM_LINT_STRAY_SCRATCH_FILES (unmapped code)", () => {
    const unmapped = makeFinding("KM_LINT_STRAY_SCRATCH_FILES");
    const result = selectUnmappedFindings([unmapped]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(unmapped);
  });

  it("filters a mixed array: keeps only unmapped findings", () => {
    const mapped = makeFinding("KM_LINT_INVENTORY_UNCOVERED");
    const unmapped1 = makeFinding("KM_WARN_VALIDATOR_ERROR");
    const unmapped2 = makeFinding("KM_WARN_LINT_ERROR");
    const result = selectUnmappedFindings([mapped, unmapped1, unmapped2]);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.code)).toEqual(["KM_WARN_VALIDATOR_ERROR", "KM_WARN_LINT_ERROR"]);
  });

  it("returns all findings when none are mapped", () => {
    const findings = [
      makeFinding("KM_WARN_VALIDATOR_ERROR"),
      makeFinding("KM_WARN_LINT_ERROR"),
    ];
    const result = selectUnmappedFindings(findings);
    expect(result).toEqual(findings);
  });

  it("returns empty array when all findings are mapped", () => {
    const findings = [
      makeFinding("KM_LINT_INVENTORY_UNCOVERED"),
      makeFinding("KM_LINT_DISPLAY_NAME_UNDERSCORE"),
    ];
    const result = selectUnmappedFindings(findings);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Render-level integration: selectUnmappedFindings -> LintSummary (AC#3 gap)
// ---------------------------------------------------------------------------
//
// Strategy B stand-in for a full StudioShell render-to-survey-stage test.
// SurveyView uses exactly these two pieces in sequence:
//   const globalFindings = selectUnmappedFindings(findings);
//   <LintSummary findings={globalFindings} />
// (StudioShell.tsx ~lines 316 and 538-540)
//
// Rendering StudioShell far enough to reach the survey-questions section
// requires navigating through 6-7 mocked wizard stages, and adding
// useValidator + LintSummary mocks to an already 15-mock test file. The
// marginal safety gained over this focused wiring test is low; this test
// proves the two-piece path directly, with no store setup or stage navigation.

describe("selectUnmappedFindings -> LintSummary render (validator error surface)", () => {
  it("renders KM_WARN_VALIDATOR_ERROR in LintSummary when VALIDATOR_ERROR_FINDING passes through selectUnmappedFindings", () => {
    // Simulate what SurveyView does: useValidator returns [VALIDATOR_ERROR_FINDING]
    // after runAllChecks throws; selectUnmappedFindings passes it through because
    // KM_WARN_VALIDATOR_ERROR has no entry in LINT_CODE_TO_QUESTION_IDS.
    const globalFindings = selectUnmappedFindings([VALIDATOR_ERROR_FINDING]);

    // globalFindings must contain exactly the validator error finding.
    expect(globalFindings).toHaveLength(1);
    expect(globalFindings[0]!.code).toBe("KM_WARN_VALIDATOR_ERROR");

    // Render the real LintSummary with those findings — no mocking needed,
    // LintSummary and its LintChip child have no WASM or store dependencies.
    render(createElement(LintSummary, { findings: globalFindings }));

    // LintChip renders finding.code in a <code> element (LintChip.tsx line 100).
    // Assert the code text is present in the document — this is the rendered
    // surface the author sees when the validator crashes.
    const codeEl = screen.getByText("KM_WARN_VALIDATOR_ERROR");
    expect(codeEl).toBeTruthy();
    expect(codeEl.tagName.toLowerCase()).toBe("code");
  });
});
