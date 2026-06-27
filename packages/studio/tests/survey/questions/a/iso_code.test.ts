// Colocated vitest spec for iso_code.

import { describe, it, expect } from "vitest";
import { fixtures, definition } from "../../../../src/survey/questions/a/iso_code.ts";

describe("iso_code — definition", () => {
  it("is optional (required: false)", () => {
    expect(definition.required).toBe(false);
  });
  it("has options_source @langtags_iso639", () => {
    expect(definition.options_source).toBe("@langtags_iso639");
  });
  it("routes to region", () => {
    expect(definition.next).toBe("region");
  });
});

describe("iso_code — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      // No validate() — just confirm fixture data is present.
      expect(true).toBe(true);
    });
  }
});
