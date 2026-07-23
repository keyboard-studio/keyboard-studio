import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/f/pf_contact_info.ts";

describe("pf_contact_info — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pf_contact_info");
  });
  it("is not required", () => {
    expect(definition.required).toBe(false);
  });
  it("is a text question", () => {
    expect(definition.type).toBe("text");
  });
  it("has null next (terminal node)", () => {
    expect(definition.next).toBeNull();
  });
});

describe("pf_contact_info — fixtures", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
});
