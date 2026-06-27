import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_existing_keyboards.ts";

describe("pb_existing_keyboards — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_existing_keyboards");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a text question", () => {
    expect(definition.type).toBe("text");
  });
  it("routes to pb_co_installed_keyboards", () => {
    expect(definition.next).toBe("pb_co_installed_keyboards");
  });
});

describe("pb_existing_keyboards — fixtures (no validate)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  for (const { value, note } of fixtures.valid) {
    it(`valid fixture: ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(true).toBe(true);
    });
  }
});
