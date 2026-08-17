// Mirror spec for il_author_name (spec 064 US1).
//
// This id exists separately from the demoted phase_a attribution module it
// borrows its prompt from, because routing lives in definition.next and the
// demoted chain ends at provenance_opt_in, which identity_lite does not contain.
import { describe, it, expect } from "vitest";
import { definition, fixtures, validate } from "../../../../src/survey/questions/a/il_author_name.ts";

describe("il_author_name — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("il_author_name");
  });
  it("required is true", () => {
    expect(definition.required).toBe(true);
  });
  it("routes to il_author_email", () => {
    expect(definition.next).toBe("il_author_email");
  });
  it("carries the Content-authored prompt from the demoted module", () => {
    expect(definition.prompt).toBeTruthy();
    expect(definition.help_text).toBeTruthy();
  });
});

describe("il_author_name — validate() (reused from the demoted module)", () => {
  it("rejects a blank author name", () => {
    const r = validate(undefined);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });
  it("accepts a real name", () => {
    expect(validate("Alice Example")).toEqual({ ok: true });
  });
});
