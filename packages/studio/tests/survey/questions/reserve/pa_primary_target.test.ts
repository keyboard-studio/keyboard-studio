// Colocated vitest spec for pa_primary_target.

import { describe, it, expect } from "vitest";
import { fixtures, definition } from "../../../../src/survey/questions/reserve/pa_primary_target.ts";

describe("pa_primary_target — definition", () => {
  it("is optional (required: false)", () => {
    expect(definition.required).toBe(false);
  });
  it("routes to author_display_name", () => {
    expect(definition.next).toBe("author_display_name");
  });
  it("has 3 options", () => {
    expect(definition.options).toHaveLength(3);
  });
});

describe("pa_primary_target — fixtures", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
});
