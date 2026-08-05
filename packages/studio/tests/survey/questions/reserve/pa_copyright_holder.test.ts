// Colocated vitest spec for pa_copyright_holder.

import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { irPath } from "@keyboard-studio/contracts";
import { applyMutatePatch, MutatePatchContainmentError } from "../../../../src/steps/mutateApply.ts";
import mod, { validate, fixtures, mutate } from "../../../../src/survey/questions/reserve/pa_copyright_holder.ts";

// ---------------------------------------------------------------------------
// T010 / US1 — mutate() output tests (spec-014 mutate-seam M2–M5)
// ---------------------------------------------------------------------------

describe("pa_copyright_holder — mutate() writes header.copyright only", () => {
  it("writes the trimmed copyright and preserves siblings (M2/SC-002)", () => {
    const base = makeTestIR([]);
    const patch = mutate("  SIL International  ", { ir: base, writes: mod.writes! });
    const result = applyMutatePatch(base, patch, mod.writes!);
    expect(result.header.copyright).toBe("SIL International");
    expect(result.header.name).toBe(base.header.name);
    expect(result.header.bcp47).toEqual(base.header.bcp47);
    expect(result.stores).toEqual(base.stores);
  });

  it("rejects a patch that strays outside writes (M3)", () => {
    const base = makeTestIR([]);
    expect(() =>
      applyMutatePatch(base, { header: { name: "x" } as never }, mod.writes!),
    ).toThrow(MutatePatchContainmentError);
  });

  it("is idempotent (M4/SC-003)", () => {
    const base = makeTestIR([]);
    const once = applyMutatePatch(base, mutate("Org", { ir: base, writes: mod.writes! }), mod.writes!);
    const twice = applyMutatePatch(once, mutate("Org", { ir: once, writes: mod.writes! }), mod.writes!);
    expect(twice).toEqual(once);
  });

  it("blank answer is a no-op (M5)", () => {
    const base = makeTestIR([]);
    expect(mutate("   ", { ir: base, writes: mod.writes! })).toEqual({});
    expect(mutate(undefined, { ir: base, writes: mod.writes! })).toEqual({});
  });

  it("declared writes is exactly [header.copyright]", () => {
    expect(mod.writes).toEqual([irPath("header", "copyright")]);
  });
});

describe("pa_copyright_holder — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("pa_copyright_holder — validate() invalid fixtures", () => {
  for (const { value, note, expectedCode } of fixtures.invalid) {
    it(`rejects ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      const result = validate(value);
      expect(result.ok).toBe(false);
      if (expectedCode !== undefined && result.ok === false) {
        expect(result.code).toBe(expectedCode);
      }
    });
  }
});

describe("pa_copyright_holder — validate() edge cases", () => {
  it("rejects empty array", () => {
    const r = validate([]);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });
});
