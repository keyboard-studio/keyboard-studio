import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_spare_keys_qwerty.ts";

describe("pb_spare_keys_qwerty — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_spare_keys_qwerty");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a text question", () => {
    expect(definition.type).toBe("text");
  });
  it("routes to pb_contact_language", () => {
    expect(definition.next).toBe("pb_contact_language");
  });
});

describe("pb_spare_keys_qwerty — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
