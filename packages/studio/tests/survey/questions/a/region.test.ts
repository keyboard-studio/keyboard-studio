// Colocated vitest spec for region.

import { describe, it, expect } from "vitest";
import { validate, fixtures } from "../../../../src/survey/questions/a/region.ts";

describe("region — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("region — validate() invalid fixtures", () => {
  for (const { value, note, expectedCode } of fixtures.invalid) {
    it(`rejects ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      const result = validate(value);
      expect(result.ok).toBe(false);
      if (expectedCode !== undefined && result.ok === false) {
        expect(result.code).toBe(expectedCode);
      }
    });
  }
});

describe("region — validate() edge cases", () => {
  it("rejects empty array", () => {
    const r = validate([]);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });

  it("accepts Unicode region names", () => {
    expect(validate("Côte d'Ivoire")).toEqual({ ok: true });
  });
});
