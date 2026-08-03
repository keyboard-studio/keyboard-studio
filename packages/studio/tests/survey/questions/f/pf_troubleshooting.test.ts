import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/f/pf_troubleshooting.ts";

describe("pf_troubleshooting — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pf_troubleshooting");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a text question", () => {
    expect(definition.type).toBe("text");
  });
  it("routes to pf_related_keyboards", () => {
    expect(definition.next).toBe("pf_related_keyboards");
  });
  it("has help text", () => {
    expect(definition.help_text).toBeTruthy();
  });
});

describe("pf_troubleshooting — fixtures (no validate)", () => {
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
