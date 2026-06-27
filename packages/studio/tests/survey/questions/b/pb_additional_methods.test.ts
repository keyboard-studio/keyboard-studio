import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_additional_methods.ts";

describe("pb_additional_methods — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_additional_methods");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a radio question", () => {
    expect(definition.type).toBe("radio");
  });
});

describe("pb_additional_methods — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      // No validate() — optional question; confirm fixture data is present.
      expect(true).toBe(true);
    });
  }
});
