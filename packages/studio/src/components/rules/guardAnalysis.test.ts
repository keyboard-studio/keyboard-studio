// Contract test for the guard-coverage analysis stub (spec 082 FR-020 /
// FR-022). The stub reports no suggestions so the UI can never show a
// fabricated guard question; when the kmAssist engine analysis lands, this
// test pins the `(rules, orthography) -> { missing, overBroad }` shape its
// replacement must keep.

import { describe, expect, it } from "vitest";
import { analyzeGuardCoverage } from "./guardAnalysis.ts";

describe("analyzeGuardCoverage", () => {
  it("returns both directions keyed exactly `missing` and `overBroad`", () => {
    const result = analyzeGuardCoverage([], null);
    expect(Object.keys(result).sort()).toEqual(["missing", "overBroad"]);
    expect(result.missing).toEqual([]);
    expect(result.overBroad).toEqual([]);
  });
});
