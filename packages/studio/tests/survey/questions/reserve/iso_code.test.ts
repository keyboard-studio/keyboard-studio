// iso_code: its apply() seam (spec-014 M2-M5). Fixtures, definition shape and the
// generic invariants run in reserveModules.test.ts.

import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { irPath } from "@keyboard-studio/contracts";
import { applyMutatePatch } from "../../../../src/steps/mutateApply.ts";
import mod, { apply } from "../../../../src/survey/questions/reserve/iso_code.ts";

// Spec 089 T020: the module's write seam is apply() now; these tests
// exercise its ir channel only (the retired mutate seam's exact successor).
function patchOf(value: string | string[] | undefined, ir: Parameters<typeof apply>[1]["ir"]) {
  return apply(value, { decisions: {}, ir, writes: mod.writes!, currentHistoryEntryState: null }).ir ?? {};
}

// ---------------------------------------------------------------------------
// T010 / US1 — apply() output tests (spec-014 mutate-seam M2–M5)
// ---------------------------------------------------------------------------

describe("iso_code — apply() writes header.bcp47 only", () => {
  it("sets the language subtag, preserving siblings (M2/SC-002)", () => {
    const base = makeTestIR([]);
    const patch = patchOf("swa", base);
    const result = applyMutatePatch(base, patch, mod.writes!);
    expect(result.header.bcp47).toEqual(["swa"]);
    expect(result.header.name).toBe(base.header.name);
    expect(result.header.copyright).toBe(base.header.copyright);
    expect(result.stores).toEqual(base.stores);
  });

  it("preserves an existing script subtag set by primary_script", () => {
    const base = makeTestIR([]);
    base.header.bcp47 = ["xx-Latn"]; // script already chosen
    const patch = patchOf("swa", base);
    const result = applyMutatePatch(base, patch, mod.writes!);
    expect(result.header.bcp47).toEqual(["swa-Latn"]);
  });

  it("lowercases and trims the code", () => {
    const base = makeTestIR([]);
    const result = applyMutatePatch(base, patchOf("  BFD  ", base), mod.writes!);
    expect(result.header.bcp47).toEqual(["bfd"]);
  });

  it("is idempotent (M4/SC-003)", () => {
    const base = makeTestIR([]);
    base.header.bcp47 = ["xx-Latn"];
    const once = applyMutatePatch(base, patchOf("swa", base), mod.writes!);
    const twice = applyMutatePatch(once, patchOf("swa", once), mod.writes!);
    expect(twice).toEqual(once);
  });

  it("blank/undefined answer is a no-op (M5 — question is optional)", () => {
    const base = makeTestIR([]);
    expect(patchOf("", base)).toEqual({});
    expect(patchOf(undefined, base)).toEqual({});
  });

  it("declared writes is exactly [header.bcp47]", () => {
    expect(mod.writes).toEqual([irPath("header", "bcp47")]);
  });
});
