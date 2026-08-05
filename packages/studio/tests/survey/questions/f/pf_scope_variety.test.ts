import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/f/pf_scope_variety.ts";

describe("pf_scope_variety — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pf_scope_variety");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a text question", () => {
    expect(definition.type).toBe("text");
  });
  it("routes to pf_provenance_basis", () => {
    expect(definition.next).toBe("pf_provenance_basis");
  });
  it("has help text", () => {
    expect(definition.help_text).toBeTruthy();
  });
});

describe("pf_scope_variety — fixtures (no validate)", () => {
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
