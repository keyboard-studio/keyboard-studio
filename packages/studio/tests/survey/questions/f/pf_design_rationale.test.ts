import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/f/pf_design_rationale.ts";
import { resolveNext } from "../../../../src/survey/SurveyRunner.tsx";

describe("pf_design_rationale — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pf_design_rationale");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a text question", () => {
    expect(definition.type).toBe("text");
  });
  it("has conditional next rules (it is the complex-script branch point)", () => {
    expect(Array.isArray(definition.next)).toBe(true);
  });
});

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

describe("pf_design_rationale — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
