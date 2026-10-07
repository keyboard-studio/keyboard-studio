// pa_copyright_holder: its apply() seam (spec-014 M2-M5). Fixtures, definition shape and the
// generic invariants run in reserveModules.test.ts.

import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { irPath } from "@keyboard-studio/contracts";
import { applyMutatePatch, MutatePatchContainmentError } from "../../../../src/steps/mutateApply.ts";
import mod, { apply } from "../../../../src/survey/questions/reserve/pa_copyright_holder.ts";

// Spec 089 T020: the module's write seam is apply() now; these tests
// exercise its ir channel only (the retired mutate seam's exact successor).
function patchOf(value: string | string[] | undefined, ir: Parameters<typeof apply>[1]["ir"]) {
  return apply(value, { decisions: {}, ir, writes: mod.writes!, currentHistoryEntryState: null }).ir ?? {};
}

// ---------------------------------------------------------------------------
// T010 / US1 — apply() output tests (spec-014 mutate-seam M2–M5)
// ---------------------------------------------------------------------------

describe("pa_copyright_holder — apply() writes header.copyright only", () => {
  it("writes the trimmed copyright and preserves siblings (M2/SC-002)", () => {
    const base = makeTestIR([]);
    const patch = patchOf("  SIL International  ", base);
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
    const once = applyMutatePatch(base, patchOf("Org", base), mod.writes!);
    const twice = applyMutatePatch(once, patchOf("Org", once), mod.writes!);
    expect(twice).toEqual(once);
  });

  it("blank answer is a no-op (M5)", () => {
    const base = makeTestIR([]);
    expect(patchOf("   ", base)).toEqual({});
    expect(patchOf(undefined, base)).toEqual({});
  });

  it("declared writes is exactly [header.copyright]", () => {
    expect(mod.writes).toEqual([irPath("header", "copyright")]);
  });
});
