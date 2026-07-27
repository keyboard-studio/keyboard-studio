// Colocated vitest spec for il_script_not_supported (identity-lite).
// Notice terminal node — no validate(), no user input.

import { describe, it, expect } from "vitest";
import mod, {
  definition,
  fixtures,
} from "../../../../src/survey/questions/a/il_script_not_supported.ts";

describe("il_script_not_supported — definition", () => {
  it("id matches filename", () => {
    expect(definition.id).toBe("il_script_not_supported");
  });

  it("type is notice", () => {
    expect(definition.type).toBe("notice");
  });

  it("required is false (terminal notice, no user input required)", () => {
    expect(definition.required).toBe(false);
  });

  it("is a terminal node (next: null)", () => {
    expect(definition.next).toBeNull();
  });

  it("prompt describes the not-yet-supported state honestly", () => {
    expect(definition.prompt).toMatch(/not supported/i);
  });
});

describe("il_script_not_supported — inputs / writes (IRPath)", () => {
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

describe("il_script_not_supported — fixtures", () => {
  it("has no invalid fixtures (terminal notice, no user input)", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });

});
