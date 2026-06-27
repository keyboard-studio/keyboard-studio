// Colocated vitest spec for provenance_requester_affiliation.

import { describe, it, expect } from "vitest";
import { fixtures, definition } from "../../../../src/survey/questions/a/provenance_requester_affiliation.ts";

describe("provenance_requester_affiliation — definition", () => {
  it("is optional (required: false)", () => {
    expect(definition.required).toBe(false);
  });
  it("routes to provenance_requester_relation", () => {
    expect(definition.next).toBe("provenance_requester_relation");
  });
});

describe("provenance_requester_affiliation — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
