import { describe, it, expect } from "vitest";
import { validate, fixtures } from "../../../../src/survey/questions/b/pb_text_sample.ts";

describe("pb_text_sample — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("pb_text_sample — validate() invalid fixtures", () => {
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

describe("pb_text_sample — validate() edge cases", () => {
  it("rejects array of empty strings", () => {
    const r = validate(["", "  "]);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });
  it("accepts non-Latin text", () => {
    expect(validate("بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ")).toEqual({ ok: true });
  });
});
