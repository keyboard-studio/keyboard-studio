// Colocated vitest spec for script_not_supported_stub.

import { describe, it, expect } from "vitest";
import { fixtures, definition } from "../../../../src/survey/questions/a/script_not_supported_stub.ts";

describe("script_not_supported_stub — definition", () => {
  it("has type notice", () => {
    expect(definition.type).toBe("notice");
  });
  it("is a terminal node (next: null)", () => {
    expect(definition.next).toBeNull();
  });
  it("required is false", () => {
    expect(definition.required).toBe(false);
  });
});

describe("script_not_supported_stub — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
