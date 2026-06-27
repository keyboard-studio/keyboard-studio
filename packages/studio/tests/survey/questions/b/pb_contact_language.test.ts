import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_contact_language.ts";

describe("pb_contact_language — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_contact_language");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a text question", () => {
    expect(definition.type).toBe("text");
  });
  it("is advisory", () => {
    expect((definition as Record<string, unknown>)["advisory"]).toBe(true);
  });
  it("routes to pb_legacy_encoding", () => {
    expect(definition.next).toBe("pb_legacy_encoding");
  });
});

describe("pb_contact_language — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
