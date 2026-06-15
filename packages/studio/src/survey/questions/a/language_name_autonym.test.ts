// Colocated vitest spec for language_name_autonym.
// Exercises validate() against the exported fixtures.

import { describe, it, expect } from "vitest";
import { validate, fixtures } from "./language_name_autonym.ts";

describe("language_name_autonym — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("language_name_autonym — validate() invalid fixtures", () => {
  for (const { value, note, expectedError } of fixtures.invalid) {
    it(`rejects ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      const result = validate(value);
      expect(result.ok).toBe(false);
      if (expectedError !== undefined && result.ok === false) {
        expect(result.message).toContain(expectedError);
      }
    });
  }
});

describe("language_name_autonym — validate() edge cases", () => {
  it("rejects undefined", () => {
    expect(validate(undefined)).toEqual({ ok: false, message: "required" });
  });

  it("rejects empty array", () => {
    expect(validate([])).toEqual({ ok: false, message: "required" });
  });

  it("accepts any non-empty Unicode string", () => {
    // Arabic, CJK, Ethiopic — no script gate at validation level
    expect(validate("عربي")).toEqual({ ok: true });
    expect(validate("日本語")).toEqual({ ok: true });
    expect(validate("አማርኛ")).toEqual({ ok: true });
  });
});
