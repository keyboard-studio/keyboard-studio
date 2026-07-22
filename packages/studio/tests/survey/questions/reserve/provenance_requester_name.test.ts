// Colocated vitest spec for provenance_requester_name.

import { describe, it, expect } from "vitest";
import { fixtures, definition } from "../../../../src/survey/questions/reserve/provenance_requester_name.ts";

describe("provenance_requester_name — definition", () => {
  it("is optional (required: false)", () => {
    expect(definition.required).toBe(false);
  });
  it("routes to provenance_requester_contact", () => {
    expect(definition.next).toBe("provenance_requester_contact");
  });
});

describe("provenance_requester_name — fixtures", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
});
