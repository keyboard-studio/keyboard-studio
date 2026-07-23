// Colocated vitest spec for provenance_language_status.

import { describe, it, expect } from "vitest";
import { fixtures, definition } from "../../../../src/survey/questions/reserve/provenance_language_status.ts";

describe("provenance_language_status — definition", () => {
  it("is optional (required: false)", () => {
    expect(definition.required).toBe(false);
  });
  it("routes to provenance_existing_tools", () => {
    expect(definition.next).toBe("provenance_existing_tools");
  });
});

describe("provenance_language_status — fixtures", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
});
