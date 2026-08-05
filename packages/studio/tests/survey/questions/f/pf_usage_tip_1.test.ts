import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/f/pf_usage_tip_1.ts";

describe("pf_usage_tip_1 — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pf_usage_tip_1");
  });

  // Phase F minimum-questions revision: this was required, which forced filler
  // tips from authors who had nothing to add. Purpose is the only required
  // Phase F answer now, so validate() was removed alongside the flag.
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });

  it("is a text question", () => {
    expect(definition.type).toBe("text");
  });

  it("routes to pf_more_detail_gate", () => {
    expect(definition.next).toBe("pf_more_detail_gate");
  });

  it("has help text", () => {
    expect(definition.help_text).toBeTruthy();
  });
});

describe("pf_usage_tip_1 — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });

  it("accepts a blank answer (optional question)", () => {
    const blanks = fixtures.valid.filter((f) => f.value === "" || f.value === undefined);
    expect(blanks.length).toBeGreaterThan(0);
  });

  // No validate() on this module (it is optional), so there is nothing to run a
  // fixture THROUGH. What is still worth pinning is that each declared value is a
  // shape the field can actually hold — a fixture authored as a number or an array
  // would otherwise sit here looking like coverage while asserting nothing.
  it("every valid fixture is a string or omitted", () => {
    for (const { value } of fixtures.valid) {
      expect(
        value === undefined || typeof value === "string",
        `fixture ${JSON.stringify(value)} is neither a string nor undefined`,
      ).toBe(true);
    }
  });
});
