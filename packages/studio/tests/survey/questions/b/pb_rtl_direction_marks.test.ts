import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_rtl_direction_marks.ts";

describe("pb_rtl_direction_marks — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_rtl_direction_marks");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a bool question", () => {
    expect(definition.type).toBe("bool");
  });
  it("is advisory", () => {
    expect((definition as Record<string, unknown>)["advisory"]).toBe(true);
  });
  it("routes true to pb_rtl_direction_marks_detail", () => {
    const routes = definition.next as Array<{ condition?: string; goto: string | null; default?: boolean }>;
    const trueRoute = routes.find(r => r.condition === "value == 'true'");
    expect(trueRoute?.goto).toBe("pb_rtl_direction_marks_detail");
  });
  it("routes false/default to pb_rtl_special_letters", () => {
    const routes = definition.next as Array<{ condition?: string; goto: string | null; default?: boolean }>;
    const defaultRoute = routes.find(r => r.default === true);
    expect(defaultRoute?.goto).toBe("pb_rtl_special_letters");
  });
});

describe("pb_rtl_direction_marks — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
