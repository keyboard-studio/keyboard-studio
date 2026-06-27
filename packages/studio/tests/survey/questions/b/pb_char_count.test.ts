import { describe, it, expect } from "vitest";
import { validate, fixtures } from "../../../../src/survey/questions/b/pb_char_count.ts";

describe("pb_char_count — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("pb_char_count — validate() invalid fixtures", () => {
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

describe("pb_char_count — validate() edge cases", () => {
  it("rejects 'massive' (out of Phase B scope per spec §9/§16)", () => {
    const r = validate("massive");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("invalid_option");
  });
  it("rejects undefined", () => {
    const r = validate(undefined);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });
});
