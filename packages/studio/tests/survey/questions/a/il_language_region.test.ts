// Colocated vitest spec for il_language_region (identity-lite, spec 030 US3).
// Conditional region-disambiguation step: shown only when the picked language is
// region-ambiguous. Optional autocomplete with no validate().

import { describe, it, expect } from "vitest";
import mod, {
  definition,
  fixtures,
} from "../../../../src/survey/questions/a/il_language_region.ts";

describe("il_language_region — definition", () => {
  it("id matches filename", () => {
    expect(definition.id).toBe("il_language_region");
  });

  it("type is autocomplete (region choices injected dynamically by IdentityLite)", () => {
    expect(definition.type).toBe("autocomplete");
  });

  it("is optional (required: false — author may skip; falls back to primary variant)", () => {
    expect(definition.required).toBe(false);
  });

  it("routes to il_language_english (rejoins the main flow)", () => {
    expect(definition.next).toBe("il_language_english");
  });

  it("has a prompt", () => {
    expect(definition.prompt).toBeTruthy();
  });
});

describe("il_language_region — inputs / writes (IRPath)", () => {
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

describe("il_language_region — fixtures (no validate)", () => {
  it("has no invalid fixtures (optional free-text)", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });

  it("has at least one valid fixture (non-empty fixture set)", () => {
    expect(fixtures.valid.length).toBeGreaterThan(0);
  });

  it("module has no validate() — optional contract", () => {
    expect(mod.validate).toBeUndefined();
  });

  it("all valid fixtures are string, empty string, or undefined (no unexpected types)", () => {
    for (const { value } of fixtures.valid) {
      const isAcceptable = typeof value === "string" || value === undefined;
      expect(
        isAcceptable,
        `Valid fixture value ${JSON.stringify(value)} is not a string or undefined`,
      ).toBe(true);
    }
  });
});
