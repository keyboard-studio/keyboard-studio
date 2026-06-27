// Colocated vitest spec for language_name_english.

import { describe, it, expect } from "vitest";
import { validate, fixtures } from "../../../../src/survey/questions/a/language_name_english.ts";

describe("language_name_english — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("language_name_english — validate() invalid fixtures", () => {
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

describe("language_name_english — validate() edge cases", () => {
  it("rejects empty array", () => {
    const r = validate([]);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });

  it("accepts non-ASCII English-context names", () => {
    expect(validate("Tigrinya")).toEqual({ ok: true });
    expect(validate("N'Ko")).toEqual({ ok: true });
  });
});
