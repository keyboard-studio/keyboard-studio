// Mirror test for the reserve adaptation module q_sa3_latin_flavor (spec 038). The module is a
// §3c confirmation resolved via the adaptation firing / posture / trust surfaces,
// not the linear Phase B walk; this fixtures-driven mirror satisfies the
// mirror-coverage gate and pins its validate() contract.

import { describe, it, expect } from "vitest";
import { validate, fixtures } from "../../../../src/survey/questions/b/q_sa3_latin_flavor.ts";

describe("q_sa3_latin_flavor — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("q_sa3_latin_flavor — validate() invalid fixtures", () => {
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

describe("q_sa3_latin_flavor — validate() edge cases", () => {
  it("rejects undefined", () => {
    const r = validate(undefined);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });
});
