import { describe, it, expect } from "vitest";
import type { LintFinding } from "@keyboard-studio/contracts";
import { buildFindingsByQuestionId } from "./lintToQuestion";

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
