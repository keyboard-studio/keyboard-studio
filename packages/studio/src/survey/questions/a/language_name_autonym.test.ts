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

describe("language_name_autonym — validate() edge cases", () => {
  it("rejects undefined", () => {
    const r = validate(undefined);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });

  it("rejects empty array", () => {
    const r = validate([]);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });

  it("accepts any non-empty Unicode string", () => {
    // Arabic, CJK, Ethiopic — no script gate at validation level
    expect(validate("عربي")).toEqual({ ok: true });
    expect(validate("日本語")).toEqual({ ok: true });
    expect(validate("አማርኛ")).toEqual({ ok: true });
  });
});
