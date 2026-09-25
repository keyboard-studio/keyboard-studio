// pf_design_rationale: the complex-script branch point. Definition shape and
// the generic invariants run in src/survey/questions/questionModules.test.ts.

import { describe, it, expect } from "vitest";
import { definition } from "../../../../src/survey/questions/f/pf_design_rationale.ts";
import { resolveNext } from "../../../../src/survey/SurveyRunner.tsx";

// The branch reads ctx.routing_group, which is set from the identity step
// (contextFromIdentity -> prefill.routingGroup, derived in lib/scriptAxes.ts).
// Latn/Cyrl/Grek/Geor/Armn produce "qwerty-qwertz"; everything else "non-roman".
describe("pf_design_rationale — routing on ctx.routing_group", () => {
  it("non-roman scripts are asked about canonical mark order", () => {
    expect(resolveNext(definition, "", { routing_group: "non-roman" })).toBe(
      "pf_canonical_order",
    );
  });

  it("qwerty-qwertz scripts skip the complex-script questions", () => {
    expect(resolveNext(definition, "", { routing_group: "qwerty-qwertz" })).toBe(
      "pf_example_words",
    );
  });

  it("an absent routing_group falls through to the default branch", () => {
    expect(resolveNext(definition, "", {})).toBe("pf_example_words");
  });
});
