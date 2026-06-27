import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_indic_vowels_onset_list.ts";

describe("pb_indic_vowels_onset_list — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_indic_vowels_onset_list");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a text question", () => {
    expect(definition.type).toBe("text");
  });
  it("routes to pb_special_letters", () => {
    expect(definition.next).toBe("pb_special_letters");
  });
});

describe("pb_indic_vowels_onset_list — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
