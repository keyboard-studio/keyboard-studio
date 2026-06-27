// Colocated vitest spec for author_contact_email.

import { describe, it, expect } from "vitest";
import { validate, fixtures } from "../../../../src/survey/questions/a/author_contact_email.ts";

describe("author_contact_email — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("author_contact_email — validate() invalid fixtures", () => {
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

describe("author_contact_email — validate() edge cases", () => {
  it("rejects empty array", () => {
    const r = validate([]);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });

  it("accepts any non-empty string (no format enforcement beyond YAML contract)", () => {
    // The YAML only guarantees required: true, not a format rule.
    expect(validate("not-an-email")).toEqual({ ok: true });
  });
});
