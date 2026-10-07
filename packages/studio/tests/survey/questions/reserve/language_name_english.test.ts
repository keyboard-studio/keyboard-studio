// language_name_english: its apply() seam (spec-014 M2-M5). Fixtures, definition shape and the
// generic invariants run in reserveModules.test.ts.

import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { irPath } from "@keyboard-studio/contracts";
import { applyMutatePatch, MutatePatchContainmentError } from "../../../../src/steps/mutateApply.ts";
import mod, { validate, apply } from "../../../../src/survey/questions/reserve/language_name_english.ts";

// Spec 089 T020: the module's write seam is apply() now; these tests
// exercise its ir channel only (the retired mutate seam's exact successor).
function patchOf(value: string | string[] | undefined, ir: Parameters<typeof apply>[1]["ir"]) {
  return apply(value, { decisions: {}, ir, writes: mod.writes!, currentHistoryEntryState: null }).ir ?? {};
}

// ---------------------------------------------------------------------------
// T010 / US1 — apply() output tests (spec-014 mutate-seam M2–M5, SC-002..004)
// ---------------------------------------------------------------------------

describe("language_name_english — apply() writes header.name only (M2/SC-002)", () => {
  it("writes the trimmed name and nothing else after merge", () => {
    const base = makeTestIR([]);
    const patch = patchOf("  Bafut  ", base);
    const result = applyMutatePatch(base, patch, mod.writes!);

    expect(result.header.name).toBe("Bafut");
    // siblings byte-identical
    expect(result.header.bcp47).toEqual(base.header.bcp47);
    expect(result.header.copyright).toBe(base.header.copyright);
    expect(result.stores).toEqual(base.stores);
    expect(result.groups).toEqual(base.groups);
  });

  it("patch stays within declared writes (header.name) — no containment throw (M3)", () => {
    const base = makeTestIR([]);
    const patch = patchOf("Swahili", base);
    expect(() => applyMutatePatch(base, patch, mod.writes!)).not.toThrow();
  });

  it("a patch sneaking another field would be rejected whole (M3 guard sanity)", () => {
    const base = makeTestIR([]);
    expect(() =>
      applyMutatePatch(base, { header: { copyright: "x" } as never }, mod.writes!),
    ).toThrow(MutatePatchContainmentError);
  });

  it("is idempotent — apply twice == once (M4/SC-003)", () => {
    const base = makeTestIR([]);
    const patch = patchOf("Hindi", base);
    const once = applyMutatePatch(base, patch, mod.writes!);
    const twice = applyMutatePatch(once, patchOf("Hindi", once), mod.writes!);
    expect(twice).toEqual(once);
  });

  it("empty/blank answer is a no-op (M5)", () => {
    const base = makeTestIR([]);
    expect(patchOf("", base)).toEqual({});
    expect(patchOf("   ", base)).toEqual({});
    expect(patchOf(undefined, base)).toEqual({});
  });

  it("declared writes is exactly [header.name] (SC-002 surface)", () => {
    expect(mod.writes).toEqual([irPath("header", "name")]);
  });
});

describe("language_name_english — validate()", () => {
  it("accepts non-ASCII English-context names", () => {
    expect(validate("Tigrinya")).toEqual({ ok: true });
    expect(validate("N'Ko")).toEqual({ ok: true });
  });
});
