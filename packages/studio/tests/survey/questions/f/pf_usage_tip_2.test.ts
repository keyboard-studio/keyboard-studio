import { describe, it, expect } from "vitest";
import {
  definition,
  fixtures,
} from "../../../../src/survey/questions/f/pf_usage_tip_2.ts";

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
  // Tips 3-5 are demoted out of the live flow. This second tip now sits inside
  // the opt-in battery, so it continues into that battery rather than chaining
  // to a third fixed tip slot. The default path asks for at most one tip.
  it("routes to pf_scope_variety", () => {
    expect(definition.next).toBe("pf_scope_variety");
  });
});

describe("pf_usage_tip_2 — fixtures", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
});
