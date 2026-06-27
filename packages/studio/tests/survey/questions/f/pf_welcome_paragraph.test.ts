import { describe, it, expect } from "vitest";
import { validate, fixtures } from "../../../../src/survey/questions/f/pf_welcome_paragraph.ts";

describe("pf_welcome_paragraph — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("pf_welcome_paragraph — validate() invalid fixtures", () => {
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

describe("pf_welcome_paragraph — validate() edge cases", () => {
  it("rejects undefined", () => {
    const r = validate(undefined);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });
  it("accepts description with Unicode characters", () => {
    expect(
      validate("Keyboard untuk mengetik Ewondo (ʼÉwondo) di komputer."),
    ).toEqual({ ok: true });
  });
});
