// Colocated vitest spec for provenance_speaker_count.

import { describe, it, expect } from "vitest";
import { fixtures, definition } from "../../../../src/survey/questions/reserve/provenance_speaker_count.ts";

describe("provenance_speaker_count — definition", () => {
  it("is optional (required: false)", () => {
    expect(definition.required).toBe(false);
  });
  it("routes to provenance_regions", () => {
    expect(definition.next).toBe("provenance_regions");
  });
});

describe("provenance_speaker_count — fixtures", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
});
