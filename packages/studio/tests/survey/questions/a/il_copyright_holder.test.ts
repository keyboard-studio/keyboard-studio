// Mirror spec for il_copyright_holder (spec 037 US1).
//
// This id exists separately from the demoted phase_a attribution module it
// borrows its prompt from, because routing lives in definition.next and the
// demoted chain ends at provenance_opt_in, which identity_lite does not contain.
import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/a/il_copyright_holder.ts";

describe("il_copyright_holder — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("il_copyright_holder");
  });
  it("required is false", () => {
    expect(definition.required).toBe(false);
  });
  it("routes to null", () => {
    expect(definition.next).toBe(null);
  });
  it("carries the Content-authored prompt from the demoted module", () => {
    expect(definition.prompt).toBeTruthy();
    expect(definition.help_text).toBeTruthy();
  });
});

describe("il_copyright_holder — fixtures (no validate; optional)", () => {
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
  it("accepts a blank answer", () => {
    const blanks = fixtures.valid.filter((f) => f.value === "" || f.value === undefined);
    expect(blanks.length).toBeGreaterThan(0);
  });
});
