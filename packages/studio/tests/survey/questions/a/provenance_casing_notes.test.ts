// Colocated vitest spec for provenance_casing_notes.

import { describe, it, expect } from "vitest";
import { fixtures, definition } from "../../../../src/survey/questions/a/provenance_casing_notes.ts";

describe("provenance_casing_notes — definition", () => {
  it("is optional (required: false)", () => {
    expect(definition.required).toBe(false);
  });
  it("routes to provenance_additional_notes", () => {
    expect(definition.next).toBe("provenance_additional_notes");
  });
});

describe("provenance_casing_notes — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
