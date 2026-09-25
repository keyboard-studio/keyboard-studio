// pf_more_detail_gate: the opt-in documentation gate. Fixtures, definition
// shape and the generic invariants run in
// src/survey/questions/questionModules.test.ts.

import { describe, it, expect } from "vitest";
import { definition } from "../../../../src/survey/questions/f/pf_more_detail_gate.ts";
import { resolveNext } from "../../../../src/survey/SurveyRunner.tsx";

describe("pf_more_detail_gate — routing", () => {
  it("Yes opens the opt-in battery at pf_doc_language", () => {
    expect(resolveNext(definition, "true", {})).toBe("pf_doc_language");
  });

  // The whole point of the gate: everything that needs research or support
  // experience is skipped, so the default walk is 5 screens.
  it("No skips the entire battery straight to pf_credits", () => {
    expect(resolveNext(definition, "false", {})).toBe("pf_credits");
  });
});
