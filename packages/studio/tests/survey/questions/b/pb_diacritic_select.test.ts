import { describe, it, expect } from "vitest";
import { validate, fixtures } from "../../../../src/survey/questions/b/pb_diacritic_select.ts";

describe("pb_diacritic_select — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("pb_diacritic_select — validate() invalid fixtures", () => {
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

describe("pb_diacritic_select — validate() edge cases", () => {
  it("rejects undefined", () => {
    const r = validate(undefined);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });
  it("accepts all 19 listed codepoints", () => {
    const all = [
      "U+0301","U+0300","U+0302","U+0303","U+0304","U+0306",
      "U+0307","U+0308","U+0309","U+030A","U+030B","U+030C",
      "U+031B","U+0323","U+0327","U+0328","U+0326","U+0332","U+0330",
    ];
    expect(validate(all)).toEqual({ ok: true });
  });
});
