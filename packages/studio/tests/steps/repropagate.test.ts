// spec-014 US2 — touch re-propagation (no-clobber / promotion / coalescing).
//
// T019 — no-clobber (R2/SC-005): a physical change re-suggests ONLY
//        base-derived/physical-suggested keys; 100% of hand-set keys are
//        byte-identical; empty-hand-set is the trivial pass (AC US2-4).
// T020 — promotion (R4/SC-006): a key promoted physical-suggested → hand-set
//        survives a subsequent re-propagation untouched.
// T021 — coalescing (R3/Q10): one physical change → a SINGLE pass over the
//        union of the staleness closure; each derived key re-suggested at most
//        once; the no-dependents case (empty closure) is a no-op (R5).
//
// Tests are written BEFORE the implementation and are expected to fail until
// repropagate.ts lands.
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/repropagation.contract.md

import { describe, it, expect, vi, afterEach } from "vitest";
import type { KeyboardIR, TouchKeyIR } from "@keyboard-studio/contracts";
import {
  buildRepropagationPatch,
  mergeNoClobber,
  repropagate,
  type RepropagateDeps,
} from "../../src/steps/repropagate.ts";
import { touchSuggest } from "../../src/editors/touchSuggest/touchSuggest.ts";
import {
  allDerivedIR,
  irWithTouch,
  key,
  layoutWithKeys,
  mixedProvenanceIR,
} from "../fixtures/touchProvenance.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Flatten every key of a layout into a flat array (single-row fixtures). */
function allKeys(ir: KeyboardIR): TouchKeyIR[] {
  const out: TouchKeyIR[] = [];
  for (const p of ir.touchLayout?.platforms ?? []) {
    for (const l of p.layers) for (const r of l.rows) out.push(...r.keys);
  }
  return out;
}

function findKey(ir: KeyboardIR, id: string): TouchKeyIR | undefined {
  return allKeys(ir).find((k) => k.id === id);
}

function makeDeps(
  ir: KeyboardIR | null,
  stale: Iterable<string>,
): { deps: RepropagateDeps; getIr: () => KeyboardIR | null; setSpy: ReturnType<typeof vi.fn> } {
  let cur = ir;
  const setSpy = vi.fn((next: KeyboardIR) => {
    cur = next;
  });
  const deps: RepropagateDeps = {
    staleSteps: new Set(stale),
    getWorkingIR: () => cur,
    setWorkingIR: setSpy,
  };
  return { deps, getIr: () => cur, setSpy };
}

// ---------------------------------------------------------------------------
// mergeNoClobber — the pure no-clobber merge (R2)
// ---------------------------------------------------------------------------

describe("mergeNoClobber (R2 no-clobber predicate)", () => {
  it("overwrites base-derived and physical-suggested keys, never hand-set", () => {
    const existing = layoutWithKeys([
      key("K_A", "a", "hand-set"),
      key("K_B", "b", "base-derived"),
      key("K_C", "c", "physical-suggested"),
    ]);
    // Fresh suggestion changes the text of every key.
    const suggested = layoutWithKeys([
      key("K_A", "A", "physical-suggested"),
      key("K_B", "B", "physical-suggested"),
      key("K_C", "C", "base-derived"),
    ]);
    const merged = mergeNoClobber(existing, suggested);
    const get = (id: string) =>
      merged.platforms[0]!.layers[0]!.rows[0]!.keys.find((k) => k.id === id)!;
    // hand-set key untouched (byte-identical to existing).
    expect(get("K_A")).toEqual(existing.platforms[0]!.layers[0]!.rows[0]!.keys[0]);
    // base-derived + physical-suggested replaced by the suggestion.
    expect(get("K_B").text).toBe("B");
    expect(get("K_C").text).toBe("C");
  });

  it("treats untagged (legacy) keys as hand-set — never overwritten", () => {
    const existing = layoutWithKeys([key("K_D", "d")]); // untagged
    const suggested = layoutWithKeys([key("K_D", "D", "physical-suggested")]);
    const merged = mergeNoClobber(existing, suggested);
    expect(merged.platforms[0]!.layers[0]!.rows[0]!.keys[0]).toEqual(
      existing.platforms[0]!.layers[0]!.rows[0]!.keys[0],
    );
  });
});

// ---------------------------------------------------------------------------
// T019 — no-clobber end-to-end (R2/SC-005)
// ---------------------------------------------------------------------------

describe("repropagate — T019 no-clobber (R2/SC-005)", () => {
  it("re-suggests only base-derived/physical-suggested keys, hand-set byte-identical", () => {
    const ir = mixedProvenanceIR();
    const handSetBefore = findKey(ir, "K_A");
    const untaggedBefore = findKey(ir, "K_D");
    const { deps, getIr } = makeDeps(ir, ["touch"]);

    repropagate(deps);
    const next = getIr()!;

    // 100% of hand-set keys byte-identical.
    expect(findKey(next, "K_A")).toEqual(handSetBefore);
    // Untagged (legacy → hand-set) also byte-identical.
    expect(findKey(next, "K_D")).toEqual(untaggedBefore);
    // The derived keys were re-suggested (provenance is an auto-managed tag).
    const reB = findKey(next, "K_B");
    const reC = findKey(next, "K_C");
    expect(reB?.provenance === "base-derived" || reB?.provenance === "physical-suggested").toBe(true);
    expect(reC?.provenance === "base-derived" || reC?.provenance === "physical-suggested").toBe(true);
  });

  it("empty-hand-set layout re-propagates with no error (trivial pass, AC US2-4)", () => {
    const ir = allDerivedIR();
    const { deps, setSpy } = makeDeps(ir, ["touch"]);
    expect(() => repropagate(deps)).not.toThrow();
    // It produced a patch (derived keys updated) without throwing.
    expect(setSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// T020 — promotion survives re-propagation (R4/SC-006)
// ---------------------------------------------------------------------------

describe("repropagate — T020 promotion (R4/SC-006)", () => {
  it("a physical-suggested key promoted to hand-set is left untouched by re-propagation", () => {
    // Author edited K_C (was physical-suggested) → promoted to hand-set.
    const promoted = irWithTouch(
      layoutWithKeys([
        key("K_B", "b", "base-derived"),
        key("K_C", "c-handedited", "hand-set"),
      ]),
    );
    const handSetBefore = findKey(promoted, "K_C");
    const { deps, getIr } = makeDeps(promoted, ["touch"]);

    repropagate(deps);
    const next = getIr()!;

    // The promoted (now hand-set) key is byte-identical after re-propagation.
    expect(findKey(next, "K_C")).toEqual(handSetBefore);
  });
});

// ---------------------------------------------------------------------------
// T021 — coalescing + no-dependents (R3/R5)
// ---------------------------------------------------------------------------

describe("repropagate — T021 coalescing (R3) + no dependents (R5)", () => {
  it("runs a SINGLE pass over the union closure — each key re-suggested at most once", () => {
    const ir = mixedProvenanceIR();
    // Several steps stale at once (the union of the staleness closure).
    const { deps, setSpy } = makeDeps(ir, ["mechanisms", "touch", "characters"]);

    repropagate(deps);

    // A single coalesced write — not once per stale step.
    expect(setSpy).toHaveBeenCalledTimes(1);
    const next = setSpy.mock.calls[0]![0] as KeyboardIR;
    // No duplicate keys produced (each id appears once).
    const ids = allKeys(next).map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("empty staleness closure is a no-op (R5) — no write", () => {
    const ir = mixedProvenanceIR();
    const { deps, setSpy } = makeDeps(ir, []);
    repropagate(deps);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("is idempotent — re-propagating twice yields the same IR", () => {
    const ir = mixedProvenanceIR();
    const { deps, getIr } = makeDeps(ir, ["touch"]);
    repropagate(deps);
    const once = getIr()!;
    repropagate(deps);
    const twice = getIr()!;
    expect(twice).toEqual(once);
  });
});

// ---------------------------------------------------------------------------
// buildRepropagationPatch — patch goes through the touchLayout surface
// ---------------------------------------------------------------------------

describe("buildRepropagationPatch", () => {
  it("produces a touchLayout-only patch (no other IR branch)", () => {
    const ir = mixedProvenanceIR();
    const suggested = touchSuggest({ physicalIR: ir });
    const patch = buildRepropagationPatch(ir, suggested);
    expect(Object.keys(patch)).toEqual(["touchLayout"]);
  });

  it("returns an empty patch when the IR ships no touch layout", () => {
    const ir = irWithTouch(layoutWithKeys([]));
    delete (ir as { touchLayout?: unknown }).touchLayout;
    const suggested = touchSuggest({ physicalIR: ir });
    const patch = buildRepropagationPatch(ir, suggested);
    expect(patch).toEqual({});
  });
});
