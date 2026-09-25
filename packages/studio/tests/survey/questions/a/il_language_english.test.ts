// il_language_english (identity-lite): the region-disambiguation branch. Fixtures,
// definition shape and the generic invariants run in
// src/survey/questions/questionModules.test.ts.

import { describe, it, expect } from "vitest";
import { definition, validate } from "../../../../src/survey/questions/a/il_language_english.ts";

describe("il_language_english — routing", () => {
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

describe("il_language_english — validate()", () => {
  it("accepts any non-empty ASCII name", () => {
    expect(validate("Bafut")).toEqual({ ok: true });
    expect(validate("Swahili")).toEqual({ ok: true });
  });
});
