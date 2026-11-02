// LDML routing in lintToQuestion (spec 108 FR-015, FR-018): the table in
// contracts/findings-routing.md, the route fallback, and distinct-code badge counting.

import { describe, it, expect } from "vitest";
import type { LintCode, LintFinding } from "@keyboard-studio/contracts";
import {
  LINT_CODE_TO_STEP_IDS,
  buildFindingsByQuestionId,
  buildStepWarningCounts,
  selectStepOwnedFindings,
  selectUnmappedFindings,
} from "./lintToQuestion.ts";

const finding = (code: string, severity: LintFinding["severity"] = "warning"): LintFinding => ({
  code: code as LintCode,
  severity,
  layer: "C",
  message: code,
});

const P = "KM_LINT_LDML_";
type Owner =
  | { kind: "question"; id: string; step: string }
  | { kind: "step"; step: string }
  | { kind: "output" };
const question = (id: string, step: string): Owner => ({ kind: "question", id, step });
const ROUTES: Record<string, Owner> = {};
for (const c of ["FRAME_KEY", "FORM_KEY_MISSING", "SHIFT_SIDE", "MNEMONIC", "CAPS_MODE", "MODIFIER", "MODIFIER_SIDES", "BKSP_NO_CONTEXT"]) {
  ROUTES[P + c] = question("physical-layout", "mechanisms");
}
for (const c of ["TOUCH_PRESENTATION", "TOUCH_SPECIAL_KEY", "NO_KEY_TRIGGER"]) {
  ROUTES[P + c] = question("touch-layout", "touch");
}
for (const c of [
  "KEY_STORE", "NEGATED_CLASS", "CONTEXT_START", "GROUP_CHAIN_PARTIAL", "MATCH_NOMATCH_OUTPUT", "CALL",
  "PLATFORM_CONDITION", "OPTION_STATE", "BASELAYOUT_CONDITION", "LAYER_STATE", "NORMALIZATION", "OPAQUE",
  "BEEP", "EXPANSION_LIMIT", "NOTANY_MULTI", "CAPTURE_LIMIT", "UNREACHABLE",
]) {
  ROUTES[P + c] = { kind: "step", step: "rules" };
}
ROUTES[P + "NO_LOCALE"] = question("iso_code", "identity");
for (const c of ["HEADER_UNSUPPORTED", "METADATA_PACKAGE_ONLY", "KEYMAN_GAP", "ANSI_ONLY", "BASE_DEADKEY"]) {
  ROUTES[P + c] = { kind: "output" };
}

describe("LDML routing table", () => {
  it("covers all 34 codes", () => {
    expect(Object.keys(ROUTES)).toHaveLength(34);
  });

  it.each(Object.entries(ROUTES))("%s routes per the contract", (code, owner) => {
    const f = finding(code);
    const byQuestion = buildFindingsByQuestionId([f]);
    const unmapped = selectUnmappedFindings([f]);
    const counts = buildStepWarningCounts([f]);
    if (owner.kind === "question") {
      expect(byQuestion[owner.id]).toEqual([f]);
      expect(unmapped).toEqual([]);
      expect(counts).toEqual({ [owner.step]: 1 });
    } else if (owner.kind === "step") {
      expect(byQuestion).toEqual({});
      expect(unmapped).toEqual([]);
      expect(selectStepOwnedFindings([f], owner.step)).toEqual([f]);
      expect(counts).toEqual({ [owner.step]: 1 });
    } else {
      expect(byQuestion).toEqual({});
      expect(unmapped).toEqual([f]);
      expect(counts).toEqual({});
    }
  });

  it("keeps LINT_CODE_TO_STEP_IDS to the rules step codes", () => {
    for (const steps of Object.values(LINT_CODE_TO_STEP_IDS)) expect(steps).toEqual(["rules"]);
  });
});

describe("route fallback", () => {
  const touchFinding = finding(P + "TOUCH_PRESENTATION", "hint");
  const rulesFinding = finding(P + "CALL");

  it("treats a finding whose step is absent from the route as unmapped (Output)", () => {
    const route = new Set(["mechanisms", "rules", "identity"]);
    expect(selectUnmappedFindings([touchFinding], route)).toEqual([touchFinding]);
    expect(buildFindingsByQuestionId([touchFinding], route)).toEqual({});
    expect(buildStepWarningCounts([touchFinding], route)).toEqual({});
    expect(selectUnmappedFindings([rulesFinding], route)).toEqual([]);
    expect(buildStepWarningCounts([rulesFinding], route)).toEqual({ rules: 1 });
  });

  it("keeps the finding on its step when the step is in the route", () => {
    const route = new Set(["touch"]);
    expect(selectUnmappedFindings([touchFinding], route)).toEqual([]);
    expect(buildFindingsByQuestionId([touchFinding], route)["touch-layout"]).toEqual([touchFinding]);
  });

  it("applies to existing codes as well", () => {
    const f = finding("KM_LINT_OE2_SOLE_SOURCE_GLYPH");
    expect(selectUnmappedFindings([f], new Set(["touch"]))).toEqual([f]);
  });
});

describe("buildStepWarningCounts: distinct LDML codes", () => {
  it("badges 2 for 300 OPTION_STATE and 2 CALL findings on one step", () => {
    const findings = [
      ...Array.from({ length: 300 }, () => finding(P + "OPTION_STATE")),
      finding(P + "CALL"),
      finding(P + "CALL"),
    ];
    expect(buildStepWarningCounts(findings)).toEqual({ rules: 2 });
  });

  it("counts hint-only LDML codes toward their step", () => {
    const hint = finding(P + "TOUCH_PRESENTATION", "hint");
    expect(buildStepWarningCounts([hint, hint])).toEqual({ touch: 1 });
  });

  it("still counts other codes once per finding", () => {
    const f = finding("KM_LINT_TOUCH_KEY_NO_RULE");
    expect(buildStepWarningCounts([f, f, f, finding(P + "CALL")])).toEqual({ touch: 3, rules: 1 });
  });

  it("adds one for an LDML code on a step that also has other codes", () => {
    const f = finding("KM_LINT_TOUCH_KEY_NO_RULE");
    const counts = buildStepWarningCounts([f, finding(P + "NO_KEY_TRIGGER"), finding(P + "NO_KEY_TRIGGER")]);
    expect(counts).toEqual({ touch: 2 });
  });
});
