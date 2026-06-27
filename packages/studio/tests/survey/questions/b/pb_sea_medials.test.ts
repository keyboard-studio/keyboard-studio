import { describe, it, expect } from "vitest";
import { validate, fixtures } from "../../../../src/survey/questions/b/pb_sea_medials.ts";

describe("pb_sea_medials — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("pb_sea_medials — validate() invalid fixtures", () => {
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

describe("pb_sea_medials — validate() edge cases", () => {
  it("rejects undefined", () => {
    const r = validate(undefined);
    expect(r.ok).toBe(false);
  });
});
