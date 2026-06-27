import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_punctuation_list.ts";

describe("pb_punctuation_list — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_punctuation_list");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a text question", () => {
    expect(definition.type).toBe("text");
  });
  it("routes to pb_digit_set", () => {
    expect(definition.next).toBe("pb_digit_set");
  });
});

describe("pb_punctuation_list — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
