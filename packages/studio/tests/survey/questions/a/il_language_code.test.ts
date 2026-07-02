// Colocated vitest spec for il_language_code (identity-lite).
// No validate() — optional free-text / autocomplete with no client-side gating.
// Type changed from "text" to "autocomplete" (T014 — langtags picker wiring).

import { describe, it, expect } from "vitest";
import mod, {
  definition,
  fixtures,
} from "../../../../src/survey/questions/a/il_language_code.ts";

describe("il_language_code — definition", () => {
  it("id matches filename", () => {
    expect(definition.id).toBe("il_language_code");
  });

  it("type is autocomplete (langtags-backed searchable picker; T014)", () => {
    expect(definition.type).toBe("autocomplete");
  });

  it("options_source is @langtags_iso639", () => {
    expect(definition.options_source).toBe("@langtags_iso639");
  });

  it("is optional (required: false)", () => {
    expect(definition.required).toBe(false);
  });

  it("routes to il_target_script", () => {
    expect(definition.next).toBe("il_target_script");
  });
});

describe("il_language_code — inputs / writes (IRPath)", () => {
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

describe("il_language_code — fixtures (no validate)", () => {
  it("has no invalid fixtures (optional free-text)", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });

  it("has at least one valid fixture (non-empty fixture set)", () => {
    expect(fixtures.valid.length).toBeGreaterThan(0);
  });

  it("module has no validate() — optional free-text contract", () => {
    // il_language_code is an optional free-text question with no client-side
    // gating. The module must not export a validate() function.
    expect(mod.validate).toBeUndefined();
  });

  it("module is not required — required: false", () => {
    expect(mod.definition.required).toBe(false);
  });

  it("all valid fixtures are string, empty string, or undefined (no unexpected types)", () => {
    for (const { value } of fixtures.valid) {
      const isAcceptable =
        typeof value === "string" || value === undefined;
      expect(
        isAcceptable,
        `Valid fixture value ${JSON.stringify(value)} is not a string or undefined`,
      ).toBe(true);
    }
  });
});
