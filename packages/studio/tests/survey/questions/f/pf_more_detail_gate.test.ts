import { describe, it, expect } from "vitest";
import { definition, validate, fixtures } from "../../../../src/survey/questions/f/pf_more_detail_gate.ts";
import { resolveNext } from "../../../../src/survey/SurveyRunner.tsx";

describe("pf_more_detail_gate — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pf_more_detail_gate");
  });
  it("is required", () => {
    expect(definition.required).toBe(true);
  });
  it("is a bool question", () => {
    expect(definition.type).toBe("bool");
  });
  it("has conditional next rules (it is a gate)", () => {
    expect(Array.isArray(definition.next)).toBe(true);
  });
});

describe("pf_more_detail_gate — routing", () => {
  it("Yes opens the opt-in battery at pf_doc_language", () => {
    expect(resolveNext(definition, "true", {})).toBe("pf_doc_language");
  });

  // The whole point of the gate: everything that needs research or support
  // experience is skipped, so the default walk is 5 screens.
  it("No skips the entire battery straight to pf_credits", () => {
    expect(resolveNext(definition, "false", {})).toBe("pf_credits");
  });
});

describe("pf_more_detail_gate — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("pf_more_detail_gate — validate() invalid fixtures", () => {
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
