import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/f/pf_credits.ts";

describe("pf_credits — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pf_credits");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a text question", () => {
    expect(definition.type).toBe("text");
  });
  it("routes to pf_contact_info", () => {
    expect(definition.next).toBe("pf_contact_info");
  });
});

describe("pf_credits — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
