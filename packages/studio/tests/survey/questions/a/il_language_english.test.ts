// Colocated vitest spec for il_language_english (identity-lite).

import { describe, it, expect } from "vitest";
import mod, {
  definition,
  validate,
  fixtures,
} from "../../../../src/survey/questions/a/il_language_english.ts";

describe("il_language_english — definition", () => {
  it("id matches filename", () => {
    expect(definition.id).toBe("il_language_english");
  });

  it("type is autocomplete (English-name-first langtags picker; spec 030 US1)", () => {
    expect(definition.type).toBe("autocomplete");
  });

  it("options_source is @langtags_names", () => {
    expect(definition.options_source).toBe("@langtags_names");
  });

  it("required is true", () => {
    expect(definition.required).toBe(true);
  });

  it("declares a conditional next: region branch (US3) + default to il_language_autonym", () => {
    // The region branch is fired at runtime by IdentityLite.getNextOverride; the
    // static rule set declares both edges so the flow graph / drift guardrail see
    // il_language_region as reachable and the default resolves to the autonym step.
    const next = definition.next;
    expect(Array.isArray(next)).toBe(true);
    const rules = next as Array<{ condition?: string; default?: boolean; goto?: string | null }>;
    const regionRule = rules.find((r) => r.goto === "il_language_region");
    expect(regionRule?.condition).toBeTruthy();
    const defaultRule = rules.find((r) => r.default === true);
    expect(defaultRule?.goto).toBe("il_language_autonym");
  });
});

describe("il_language_english — inputs / writes (IRPath)", () => {
  it("inputs is an array", () => {
    expect(Array.isArray(mod.inputs)).toBe(true);
  });

  it("writes is an array", () => {
    expect(Array.isArray(mod.writes)).toBe(true);
  });

  it("inputs is empty (no IR reads declared)", () => {
    expect(mod.inputs).toHaveLength(0);
  });

  it("writes is empty (no IR writes declared)", () => {
    expect(mod.writes).toHaveLength(0);
  });
});

describe("il_language_english — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("il_language_english — validate() invalid fixtures", () => {
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

describe("il_language_english — validate() edge cases", () => {
  it("rejects empty string", () => {
    const r = validate("");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });

  it("rejects undefined", () => {
    const r = validate(undefined);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });

  it("rejects whitespace-only string", () => {
    const r = validate("   ");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });

  it("accepts any non-empty ASCII name", () => {
    expect(validate("Bafut")).toEqual({ ok: true });
    expect(validate("Swahili")).toEqual({ ok: true });
  });
});
