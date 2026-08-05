import { describe, it, expect } from "vitest";
import { definition, validate, fixtures } from "../../../../src/survey/questions/f/pf_doc_language.ts";

describe("pf_doc_language — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pf_doc_language");
  });
  // Optional: blank means English, so opting into the battery never blocks an
  // author on a question they have no view on.
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a radio question", () => {
    expect(definition.type).toBe("radio");
  });
  it("offers english, target, and bilingual", () => {
    expect(definition.options.map((o) => o.value)).toEqual([
      "english",
      "target",
      "bilingual",
    ]);
  });
  it("routes to pf_font_guidance", () => {
    expect(definition.next).toBe("pf_font_guidance");
  });
});

describe("pf_doc_language — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("pf_doc_language — validate() invalid fixtures", () => {
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

describe("pf_doc_language — validate() edge cases", () => {
  it("rejects an unoffered option with invalid_option", () => {
    const r = validate("klingon");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("invalid_option");
  });
  it("accepts undefined (optional — blank means English)", () => {
    expect(validate(undefined)).toEqual({ ok: true });
  });
  it("accepts blank (optional — blank means English)", () => {
    expect(validate("")).toEqual({ ok: true });
  });
});
