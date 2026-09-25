// il_target_script (identity-lite): select question with conditional next
// routing to the not-supported notice. Fixtures, definition shape, the
// every-declared-option check and the generic invariants run in
// src/survey/questions/questionModules.test.ts.

import { describe, it, expect } from "vitest";
import { definition, validate } from "../../../../src/survey/questions/a/il_target_script.ts";

describe("il_target_script — options and routing", () => {
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
    expect(conditional?.goto).toBe("il_script_not_supported");
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
    expect(fallthrough?.condition).toBeUndefined();
  });

  // spec 064 US1: the supported path is no longer terminal — it continues into
  // attribution capture. The GATED path still terminates (see the branch above).
  it("default branch continues to attribution capture", () => {
    const rules = definition.next as Array<{
      condition?: string;
      goto: string | null;
      default?: unknown;
    }>;
    const fallthrough = rules.find((r) => "default" in r);
    expect(fallthrough?.goto).toBe("il_author_name");
  });
});

describe("il_target_script — validate()", () => {
  it("rejects unknown script code", () => {
    const r = validate("xxxx");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("invalid_option");
  });
});
