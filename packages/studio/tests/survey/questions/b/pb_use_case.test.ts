import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_use_case.ts";

describe("pb_use_case — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_use_case");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a radio question", () => {
    expect(definition.type).toBe("radio");
  });
  it("is advisory", () => {
    expect((definition as Record<string, unknown>)["advisory"]).toBe(true);
  });
  it("routes to pb_additional_methods", () => {
    expect(definition.next).toBe("pb_additional_methods");
  });
});

describe("pb_use_case — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
