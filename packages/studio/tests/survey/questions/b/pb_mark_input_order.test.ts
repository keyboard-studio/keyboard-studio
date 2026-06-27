import { describe, it, expect } from "vitest";
import { validate, fixtures } from "../../../../src/survey/questions/b/pb_mark_input_order.ts";

describe("pb_mark_input_order — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("pb_mark_input_order — validate() invalid fixtures", () => {
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

describe("pb_mark_input_order — validate() edge cases", () => {
  it("rejects undefined (A3a probe is required when shown)", () => {
    const r = validate(undefined);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });
});
