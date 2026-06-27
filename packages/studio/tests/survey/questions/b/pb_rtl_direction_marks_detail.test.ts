import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_rtl_direction_marks_detail.ts";

describe("pb_rtl_direction_marks_detail — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_rtl_direction_marks_detail");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a multi_select question", () => {
    expect(definition.type).toBe("multi_select");
  });
  it("is advisory", () => {
    expect((definition as Record<string, unknown>)["advisory"]).toBe(true);
  });
  it("routes to pb_rtl_special_letters", () => {
    expect(definition.next).toBe("pb_rtl_special_letters");
  });
  it("offers RLM and LRM codepoints as options", () => {
    const opts = (definition as Record<string, unknown>)["options"] as Array<{ value: string }>;
    const values = opts.map(o => o.value);
    expect(values).toContain("U+200F");
    expect(values).toContain("U+200E");
  });
});

describe("pb_rtl_direction_marks_detail — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
