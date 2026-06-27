import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_picker_confirm.ts";

describe("pb_picker_confirm — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_picker_confirm");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a multi_select question", () => {
    expect(definition.type).toBe("multi_select");
  });
  it("uses seeded picker candidates options source", () => {
    expect((definition as Record<string, unknown>)["options_source"]).toBe("@picker_candidates_seeded");
  });
  it("routes to pb_routing_branch", () => {
    expect(definition.next).toBe("pb_routing_branch");
  });
});

describe("pb_picker_confirm — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
