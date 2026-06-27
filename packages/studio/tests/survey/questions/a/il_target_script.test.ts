// Colocated vitest spec for il_target_script (identity-lite).
// select question with conditional next routing.

import { describe, it, expect } from "vitest";
import mod, {
  definition,
  validate,
  fixtures,
} from "../../../../src/survey/questions/a/il_target_script.ts";

describe("il_target_script — definition", () => {
  it("id matches filename", () => {
    expect(definition.id).toBe("il_target_script");
  });

  it("type is select", () => {
    expect(definition.type).toBe("select");
  });

  it("required is true", () => {
    expect(definition.required).toBe(true);
  });

  it("has 14 options", () => {
    expect(definition.options).toHaveLength(14);
  });

  it("options include Latn, Arab, Ethi, Hani, Hang, and other", () => {
    const values = (definition.options ?? []).map((o) => o.value);
    expect(values).toContain("Latn");
    expect(values).toContain("Arab");
    expect(values).toContain("Ethi");
    expect(values).toContain("Hani");
    expect(values).toContain("Hang");
    expect(values).toContain("other");
  });

  it("next is an array (conditional routing)", () => {
    expect(Array.isArray(definition.next)).toBe(true);
  });

  it("next contains a conditional branch to il_script_not_supported", () => {
    const rules = definition.next as Array<{
      condition?: string;
      goto: string | null;
      default?: unknown;
    }>;
    const conditional = rules.find(
      (r) => r.condition !== undefined && r.goto === "il_script_not_supported",
    );
    expect(conditional).toBeDefined();
  });

  it("conditional branch covers Ethi, Hani, and Hang", () => {
    const rules = definition.next as Array<{ condition?: string; goto: string | null }>;
    const conditional = rules.find(
      (r) => r.condition !== undefined && r.goto === "il_script_not_supported",
    );
    expect(conditional?.condition).toContain("Ethi");
    expect(conditional?.condition).toContain("Hani");
    expect(conditional?.condition).toContain("Hang");
  });

  it("has a default (fallthrough) branch", () => {
    const rules = definition.next as Array<{
      condition?: string;
      goto: string | null;
      default?: unknown;
    }>;
    const fallthrough = rules.find((r) => "default" in r);
    expect(fallthrough).toBeDefined();
  });

  it("default branch goto is null (terminal)", () => {
    const rules = definition.next as Array<{
      condition?: string;
      goto: string | null;
      default?: unknown;
    }>;
    const fallthrough = rules.find((r) => "default" in r);
    expect(fallthrough?.goto).toBeNull();
  });
});

describe("il_target_script — inputs / writes (IRPath)", () => {
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

describe("il_target_script — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("il_target_script — validate() invalid fixtures", () => {
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

describe("il_target_script — validate() edge cases", () => {
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

  it("rejects unknown script code", () => {
    const r = validate("xxxx");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("invalid_option");
  });

  it("accepts all 14 declared option values", () => {
    const values = (definition.options ?? []).map((o) => o.value);
    for (const v of values) {
      expect(validate(v), `expected ${v} to be valid`).toEqual({ ok: true });
    }
  });
});
