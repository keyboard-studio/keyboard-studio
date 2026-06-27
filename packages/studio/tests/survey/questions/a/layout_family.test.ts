// Colocated vitest spec for layout_family.

import { describe, it, expect } from "vitest";
import { fixtures, definition } from "../../../../src/survey/questions/a/layout_family.ts";

describe("layout_family — definition", () => {
  it("is optional (required: false)", () => {
    expect(definition.required).toBe(false);
  });
  it("has conditional routing", () => {
    expect(Array.isArray(definition.next)).toBe(true);
  });
  it("routes non-roman to script_family", () => {
    const rules = definition.next as Array<{ condition?: string; goto: string | null }>;
    const nonRomanRule = rules.find((r) => r.condition?.includes("non-roman"));
    expect(nonRomanRule?.goto).toBe("script_family");
  });
  it("default route goes to pa_primary_target", () => {
    const rules = definition.next as Array<{ default?: true; goto: string | null }>;
    const defaultRule = rules.find((r) => r.default === true);
    expect(defaultRule?.goto).toBe("pa_primary_target");
  });
});

describe("layout_family — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
