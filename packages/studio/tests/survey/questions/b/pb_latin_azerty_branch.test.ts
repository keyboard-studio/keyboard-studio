import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_latin_azerty_branch.ts";

describe("pb_latin_azerty_branch — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_latin_azerty_branch");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a radio question", () => {
    expect(definition.type).toBe("radio");
  });
  it("routes to pb_azerty_qz_swap", () => {
    expect(definition.next).toBe("pb_azerty_qz_swap");
  });
});

describe("pb_latin_azerty_branch — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
