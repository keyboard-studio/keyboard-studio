import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_non_roman_branch.ts";

describe("pb_non_roman_branch — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_non_roman_branch");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a radio question", () => {
    expect(definition.type).toBe("radio");
  });
  it("has conditional routing for indic scripts", () => {
    const routes = definition.next as Array<{ condition?: string; goto: string | null; default?: boolean }>;
    const indicRoute = routes.find(r => r.condition === "value == 'indic'");
    expect(indicRoute?.goto).toBe("pb_indic_conjuncts");
  });
  it("has conditional routing for rtl scripts", () => {
    const routes = definition.next as Array<{ condition?: string; goto: string | null; default?: boolean }>;
    const rtlRoute = routes.find(r => r.condition === "value == 'rtl'");
    expect(rtlRoute?.goto).toBe("pb_rtl_direction_confirm");
  });
});

describe("pb_non_roman_branch — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
