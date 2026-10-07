// primary_script: its apply() seam (spec-014 M2-M5). Fixtures, definition shape and the
// generic invariants run in reserveModules.test.ts.

import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { irPath } from "@keyboard-studio/contracts";
import { applyMutatePatch } from "../../../../src/steps/mutateApply.ts";
import mod, { validate, apply } from "../../../../src/survey/questions/reserve/primary_script.ts";

// Spec 089 T020: the module's write seam is apply() now; these tests
// exercise its ir channel only (the retired mutate seam's exact successor).
function patchOf(value: string | string[] | undefined, ir: Parameters<typeof apply>[1]["ir"]) {
  return apply(value, { decisions: {}, ir, writes: mod.writes!, currentHistoryEntryState: null }).ir ?? {};
}

// ---------------------------------------------------------------------------
// T010 / US1 — apply() output tests (spec-014 mutate-seam M2–M5)
// ---------------------------------------------------------------------------

describe("primary_script — apply() writes header.bcp47 only", () => {
  it("merges the script subtag onto the existing language (M2/SC-002)", () => {
    const base = makeTestIR([]);
    base.header.bcp47 = ["ha"]; // language already chosen by iso_code
    const result = applyMutatePatch(base, patchOf("Latn", base), mod.writes!);
    expect(result.header.bcp47).toEqual(["ha-Latn"]);
    expect(result.header.name).toBe(base.header.name);
    expect(result.stores).toEqual(base.stores);
  });

  it("re-merging replaces a prior script (idempotent across script change)", () => {
    const base = makeTestIR([]);
    base.header.bcp47 = ["hi-Deva"];
    const result = applyMutatePatch(base, patchOf("Arab", base), mod.writes!);
    expect(result.header.bcp47).toEqual(["hi-Arab"]);
  });

  it("preserves variant/extension/private-use subtags beyond the script position", () => {
    // BCP-47 order: language-Script-REGION-variant-extension. Changing the
    // script must REPLACE the script subtag in place and keep everything after
    // it. swa-Latn-x-foo + Cyrl → swa-Cyrl-x-foo.
    const base = makeTestIR([]);
    base.header.bcp47 = ["swa-Latn-x-foo"];
    const result = applyMutatePatch(
      base,
      patchOf("Cyrl", base),
      mod.writes!,
    );
    expect(result.header.bcp47).toEqual(["swa-Cyrl-x-foo"]);
  });

  it("inserts the script after the language when none was present, preserving the tail", () => {
    // No existing script subtag (region/private-use only): insert at position 2.
    // de-CH-1996 + Latn → de-Latn-CH-1996 (region + variant carried over).
    const base = makeTestIR([]);
    base.header.bcp47 = ["de-CH-1996"];
    const result = applyMutatePatch(
      base,
      patchOf("Latn", base),
      mod.writes!,
    );
    expect(result.header.bcp47).toEqual(["de-Latn-CH-1996"]);
  });

  it("writes the script alone when no language subtag exists yet", () => {
    const base = makeTestIR([]); // bcp47 = []
    const result = applyMutatePatch(base, patchOf("Latn", base), mod.writes!);
    expect(result.header.bcp47).toEqual(["Latn"]);
  });

  it("is idempotent (M4/SC-003)", () => {
    const base = makeTestIR([]);
    base.header.bcp47 = ["ha"];
    const once = applyMutatePatch(base, patchOf("Latn", base), mod.writes!);
    const twice = applyMutatePatch(once, patchOf("Latn", once), mod.writes!);
    expect(twice).toEqual(once);
  });

  it('"Other" and blank are no-ops (M5)', () => {
    const base = makeTestIR([]);
    expect(patchOf("Other", base)).toEqual({});
    expect(patchOf("", base)).toEqual({});
    expect(patchOf(undefined, base)).toEqual({});
  });

  it("declared writes is exactly [header.bcp47]", () => {
    expect(mod.writes).toEqual([irPath("header", "bcp47")]);
  });
});

describe("primary_script — validate()", () => {
  it("rejects lowercase script codes", () => {
    const r = validate("latn");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("invalid_option");
  });
});
