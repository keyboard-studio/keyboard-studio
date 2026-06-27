import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_special_letters_notes.ts";

describe("pb_special_letters_notes — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_special_letters_notes");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a text question", () => {
    expect(definition.type).toBe("text");
  });
  it("routes to pb_latin_digraphs_gate", () => {
    expect(definition.next).toBe("pb_latin_digraphs_gate");
  });
});

describe("pb_special_letters_notes — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
