// language_name_english: its mutate() seam (spec-014 M2-M5). Fixtures, definition shape and the
// generic invariants run in reserveModules.test.ts.

import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { irPath } from "@keyboard-studio/contracts";
import { applyMutatePatch, MutatePatchContainmentError } from "../../../../src/steps/mutateApply.ts";
import mod, { validate, mutate } from "../../../../src/survey/questions/reserve/language_name_english.ts";

// ---------------------------------------------------------------------------
// T010 / US1 — mutate() output tests (spec-014 mutate-seam M2–M5, SC-002..004)
// ---------------------------------------------------------------------------

describe("language_name_english — mutate() writes header.name only (M2/SC-002)", () => {
  it("writes the trimmed name and nothing else after merge", () => {
    const base = makeTestIR([]);
    const patch = mutate("  Bafut  ", { ir: base, writes: mod.writes! });
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
    const patch = mutate("Swahili", { ir: base, writes: mod.writes! });
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
    const patch = mutate("Hindi", { ir: base, writes: mod.writes! });
    const once = applyMutatePatch(base, patch, mod.writes!);
    const twice = applyMutatePatch(once, mutate("Hindi", { ir: once, writes: mod.writes! }), mod.writes!);
    expect(twice).toEqual(once);
  });

  it("empty/blank answer is a no-op (M5)", () => {
    const base = makeTestIR([]);
    expect(mutate("", { ir: base, writes: mod.writes! })).toEqual({});
    expect(mutate("   ", { ir: base, writes: mod.writes! })).toEqual({});
    expect(mutate(undefined, { ir: base, writes: mod.writes! })).toEqual({});
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
