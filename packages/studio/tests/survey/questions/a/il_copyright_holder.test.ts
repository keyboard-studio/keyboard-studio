// Mirror spec for il_copyright_holder (spec 064 US1).
//
// This id exists separately from the demoted phase_a attribution module it
// borrows its prompt from, because routing lives in definition.next and the
// demoted chain ends at provenance_opt_in, which identity_lite does not contain.
import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/a/il_copyright_holder.ts";
import paCopyrightHolder from "../../../../src/survey/questions/reserve/pa_copyright_holder.ts";

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

  // HANDOFF-CONTENT item 5. Not wording polish: without this sentence an author
  // may credit the base author by hand, and an invisible typo (the double space in
  // `SIL  International`) emits two copyright holders for one organisation in a
  // legal notice. Dedupe is exact-match by decision D4, so prevention has to
  // happen in the prompt — nothing downstream can recover from it.
  it("tells the author a derived keyboard's original copyright is already retained", () => {
    expect(definition.help_text).toContain("kept automatically");
    expect(definition.help_text).toContain("does not need re-entering");
  });

  it("extends the demoted module's help text rather than replacing it", () => {
    // Route B: identity-lite-specific guidance appended to the shared Content
    // wording, so an edit to the base module still reaches this question.
    const base = paCopyrightHolder.definition.help_text;
    const extended = definition.help_text;
    // help_text is optional on FlowQuestion; both must be present for the
    // composition to mean anything, so assert that before comparing.
    expect(base).toBeDefined();
    expect(extended).toBeDefined();
    expect(extended!.startsWith(base!)).toBe(true);
    expect(extended!.length).toBeGreaterThan(base!.length);
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
