// Colocated vitest spec for provenance_community_rep_role.

import { describe, it, expect } from "vitest";
import { fixtures, definition } from "../../../../src/survey/questions/reserve/provenance_community_rep_role.ts";

describe("provenance_community_rep_role — definition", () => {
  it("is optional (required: false)", () => {
    expect(definition.required).toBe(false);
  });
  it("routes to provenance_community_rep_email", () => {
    expect(definition.next).toBe("provenance_community_rep_email");
  });
});

describe("provenance_community_rep_role — fixtures", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
});
