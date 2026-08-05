// Colocated vitest spec for provenance_requester_relation.

import { describe, it, expect } from "vitest";
import { fixtures, definition } from "../../../../src/survey/questions/reserve/provenance_requester_relation.ts";

describe("provenance_requester_relation — definition", () => {
  it("is optional (required: false)", () => {
    expect(definition.required).toBe(false);
  });
  it("routes to provenance_community_rep_name", () => {
    expect(definition.next).toBe("provenance_community_rep_name");
  });
});

describe("provenance_requester_relation — fixtures", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
});
