import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/f/pf_canonical_order.ts";

describe("pf_canonical_order — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pf_canonical_order");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a short_text question", () => {
    expect(definition.type).toBe("short_text");
  });
  it("routes to pf_script_glossary", () => {
    expect(definition.next).toBe("pf_script_glossary");
  });
  it("has help text", () => {
    expect(definition.help_text).toBeTruthy();
  });
});

describe("pf_canonical_order — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  it("accepts a blank answer (optional question)", () => {
    const blanks = fixtures.valid.filter((f) => f.value === "" || f.value === undefined);
    expect(blanks.length).toBeGreaterThan(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
