// Colocated vitest spec for il_language_autonym (identity-lite).

import { describe, it, expect } from "vitest";
import mod, {
  definition,
  validate,
  fixtures,
} from "../../../../src/survey/questions/a/il_language_autonym.ts";

describe("il_language_autonym — definition", () => {
  it("id matches filename", () => {
    expect(definition.id).toBe("il_language_autonym");
  });

  it("type is text", () => {
    expect(definition.type).toBe("text");
  });

  it("required is true", () => {
    expect(definition.required).toBe(true);
  });

  it("routes to il_target_script", () => {
    expect(definition.next).toBe("il_target_script");
  });
});

describe("il_language_autonym — inputs / writes (IRPath)", () => {
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

describe("il_language_autonym — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("il_language_autonym — validate() invalid fixtures", () => {
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

describe("il_language_autonym — validate() edge cases", () => {
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

  it("accepts any non-empty Unicode string (no script gate at validation)", () => {
    expect(validate("Faʼ")).toEqual({ ok: true });
    expect(validate(" አማርኛ")).toEqual({ ok: true });
    expect(validate("日本語")).toEqual({ ok: true });
  });
});
