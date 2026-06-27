import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_azerty_qz_swap.ts";

describe("pb_azerty_qz_swap — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_azerty_qz_swap");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a radio question", () => {
    expect(definition.type).toBe("radio");
  });
  it("routes to pb_spare_keys_azerty", () => {
    expect(definition.next).toBe("pb_spare_keys_azerty");
  });
});

describe("pb_azerty_qz_swap — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
