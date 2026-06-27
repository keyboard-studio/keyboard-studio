import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_rtl_special_letters.ts";

describe("pb_rtl_special_letters — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_rtl_special_letters");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a text question", () => {
    expect(definition.type).toBe("text");
  });
  it("routes to pb_special_letters (shared universal tail)", () => {
    expect(definition.next).toBe("pb_special_letters");
  });
});

describe("pb_rtl_special_letters — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
