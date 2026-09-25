// pb_standard_letters: its mutate() seam (spec-014 M2-M5). Fixtures, definition
// shape and the generic invariants run in
// src/survey/questions/questionModules.test.ts.

import { describe, it, expect } from "vitest";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";
import { irPath, ARRAY_INDEX } from "@keyboard-studio/contracts";
import { applyMutatePatch } from "../../../../src/steps/mutateApply.ts";
import mod, { mutate } from "../../../../src/survey/questions/b/pb_standard_letters.ts";

describe("pb_standard_letters — mutate() writes stores[] only", () => {
  it("appends a script-group store, preserving existing stores (M2/SC-002)", () => {
    const base = makeTestIR([], [makeCharStore("s0", "letters", "abc")]);
    const result = applyMutatePatch(base, mutate("basic-az", { ir: base, writes: mod.writes! }), mod.writes!);
    expect(result.stores).toHaveLength(2);
    // pre-existing store byte-identical
    expect(result.stores[0]).toEqual(base.stores[0]);
    const added = result.stores.find((s) => s.name === "kmStandardLetters");
    expect(added).toBeDefined();
    expect(added!.items).toEqual([{ kind: "raw", text: "basic-az" }]);
    // header / groups untouched
    expect(result.header).toEqual(base.header);
    expect(result.groups).toEqual(base.groups);
  });

  it("re-answering REPLACES the prior script-group store, not append (M4/idempotency)", () => {
    const base = makeTestIR([], [makeCharStore("s0", "letters", "abc")]);
    const first = applyMutatePatch(base, mutate("basic-az", { ir: base, writes: mod.writes! }), mod.writes!);
    const second = applyMutatePatch(first, mutate("extended-latin", { ir: first, writes: mod.writes! }), mod.writes!);
    const groupStores = second.stores.filter((s) => s.name === "kmStandardLetters");
    expect(groupStores).toHaveLength(1);
    expect(groupStores[0]!.items).toEqual([{ kind: "raw", text: "extended-latin" }]);
    expect(second.stores).toHaveLength(2);
  });

  it("re-applying the SAME answer is idempotent (M4/SC-003)", () => {
    const base = makeTestIR([], [makeCharStore("s0", "letters", "abc")]);
    const once = applyMutatePatch(base, mutate("basic-az", { ir: base, writes: mod.writes! }), mod.writes!);
    const twice = applyMutatePatch(once, mutate("basic-az", { ir: once, writes: mod.writes! }), mod.writes!);
    expect(twice).toEqual(once);
  });

  it("an invalid/blank answer is a no-op (M5)", () => {
    const base = makeTestIR([]);
    expect(mutate("", { ir: base, writes: mod.writes! })).toEqual({});
    expect(mutate("cyrillic", { ir: base, writes: mod.writes! })).toEqual({});
    expect(mutate(undefined, { ir: base, writes: mod.writes! })).toEqual({});
  });

  it("declared writes is exactly [stores[]]", () => {
    expect(mod.writes).toEqual([irPath("stores", ARRAY_INDEX)]);
  });
});
