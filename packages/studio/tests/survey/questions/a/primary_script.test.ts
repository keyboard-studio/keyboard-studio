// Colocated vitest spec for primary_script.

import { describe, it, expect } from "vitest";
import { validate, fixtures } from "../../../../src/survey/questions/a/primary_script.ts";

describe("primary_script — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("primary_script — validate() invalid fixtures", () => {
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

describe("primary_script — validate() edge cases", () => {
  it("accepts all 28 valid option values", () => {
    const allValues = [
      "Latn", "Arab", "Hebr", "Deva", "Beng", "Taml", "Telu", "Knda", "Mlym",
      "Guru", "Gujr", "Orya", "Sinh", "Thai", "Khmr", "Mymr", "Laoo", "Ethi",
      "Hang", "Hani", "Geor", "Armn", "Cyrl", "Grek", "Tibt", "Cans", "Cher",
      "Other",
    ];
    for (const v of allValues) {
      expect(validate(v), `expected ${v} to be valid`).toEqual({ ok: true });
    }
  });

  it("rejects lowercase script codes", () => {
    const r = validate("latn");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("invalid_option");
  });
});
