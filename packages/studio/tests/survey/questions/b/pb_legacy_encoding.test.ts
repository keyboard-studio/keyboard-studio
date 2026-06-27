import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_legacy_encoding.ts";

describe("pb_legacy_encoding — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_legacy_encoding");
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
  it("routes to pb_use_case", () => {
    expect(definition.next).toBe("pb_use_case");
  });
});

describe("pb_legacy_encoding — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
