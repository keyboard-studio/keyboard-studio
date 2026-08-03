import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/f/pf_usage_tip_2.ts";

describe("pf_usage_tip_2 — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pf_usage_tip_2");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a text question", () => {
    expect(definition.type).toBe("text");
  });
  // Phase F documentation revision: tips 3-5 are demoted out of the live flow,
  // so the chain hands off to the depth gate instead of a third fixed tip slot.
  it("routes to pf_more_detail_gate", () => {
    expect(definition.next).toBe("pf_more_detail_gate");
  });
});

describe("pf_usage_tip_2 — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
