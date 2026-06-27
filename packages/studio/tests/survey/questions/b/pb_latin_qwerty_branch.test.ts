import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_latin_qwerty_branch.ts";

describe("pb_latin_qwerty_branch — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_latin_qwerty_branch");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a radio question", () => {
    expect(definition.type).toBe("radio");
  });
  it("routes to pb_spare_keys_qwerty", () => {
    expect(definition.next).toBe("pb_spare_keys_qwerty");
  });
});

describe("pb_latin_qwerty_branch — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
