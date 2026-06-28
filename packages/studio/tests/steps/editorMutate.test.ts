// T016b (US1) — editorMutate: the carve editor-shell write helper routes the
// carve overlay through the single mutate() write path (applyMutatePatch with
// CARVE_WRITES).
//
// Guarantees mirrored from mutate-seam.contract.md:
//   - containment: the carve patch only ever touches groups/stores/raw (M3).
//   - idempotency: applying the same overlay twice = once (M4).
//   - reversibility: a shrinking deletion set → fewer deletions (the patch is a
//     pure function of baseIr + overlay, never chained).
//   - keepAll/restoreAll (empty overlay) → empty patch → structural copy (M5).
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/mutate-seam.contract.md

import { describe, it, expect } from "vitest";
import {
  applyCarveMutate,
  buildCarvePatch,
  CARVE_WRITES,
} from "../../src/steps/editorMutate.ts";
import { applyMutatePatch } from "../../src/steps/mutateApply.ts";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR, IRGroup, IRRule, IRStore } from "@keyboard-studio/contracts";

function rule(nodeId: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
    output: [{ kind: "char", value: "a" }],
  };
}

function group(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

// An output store referenced by index() so applyStoreSlotRemovals treats its
// slots as eligible for nul-fillers.
function outputStore(nodeId: string, name: string, chars: string): IRStore {
  return makeCharStore(nodeId, name, chars);
}

function freshIR(): KeyboardIR {
  const g = group("g0", "main", [
    rule("r0"),
    {
      nodeId: "r1",
      context: [{ kind: "vkey", name: "K_B", modifiers: [] }],
      output: [{ kind: "index", storeRef: "dkt", offset: 2 }],
    },
  ]);
  const stores = [outputStore("dkt", "dkt", "xyz"), makeCharStore("s1", "extra", "de")];
  return makeTestIR([g], stores);
}

describe("editorMutate — CARVE_WRITES", () => {
  it("declares exactly groups[], stores[], raw[] (header/comments excluded)", () => {
    expect(CARVE_WRITES).toHaveLength(3);
    const heads = CARVE_WRITES.map((p) => p[0]);
    expect(heads).toEqual(["groups", "stores", "raw"]);
  });
});

describe("editorMutate — buildCarvePatch / applyCarveMutate (containment, M3)", () => {
  it("the patch only ever touches groups/stores/raw — never header/comments", () => {
    const ir = freshIR();
    const patch = buildCarvePatch(ir, new Set(["g0"]), new Set());
    const keys = Object.keys(patch).sort();
    expect(keys).toEqual(["groups", "raw", "stores"]);
    // And it survives the containment check (no throw).
    expect(() => applyMutatePatch(ir, patch, CARVE_WRITES)).not.toThrow();
  });

  it("drops a whole group via the seam (groups[] write)", () => {
    const ir = freshIR();
    const out = applyCarveMutate(ir, new Set(["g0"]), new Set());
    expect(out.groups).toHaveLength(0);
    // base untouched (purity / M1)
    expect(ir.groups).toHaveLength(1);
  });

  it("drops a whole store via the seam (stores[] write)", () => {
    const ir = freshIR();
    const out = applyCarveMutate(ir, new Set(["s1"]), new Set());
    expect(out.stores.map((s) => s.nodeId)).toEqual(["dkt"]);
  });

  it("rewrites a store slot to a nul filler (deletedItemIds slot path)", () => {
    const ir = freshIR();
    const out = applyCarveMutate(ir, new Set(), new Set(["dkt#1"]));
    const dkt = out.stores.find((s) => s.nodeId === "dkt")!;
    expect(dkt.items[1]).toEqual({ kind: "raw", text: "nul" });
    // sibling slots preserved
    expect(dkt.items[0]).toEqual({ kind: "char", value: "x" });
  });

  it("treats a bare rule item id as a whole-node deletion", () => {
    const ir = freshIR();
    const out = applyCarveMutate(ir, new Set(), new Set(["r0"]));
    expect(out.groups[0]!.rules.map((r) => r.nodeId)).toEqual(["r1"]);
  });
});

describe("editorMutate — idempotency (M4) and reversibility", () => {
  it("applying the same overlay twice is byte-identical to once", () => {
    const ir = freshIR();
    const once = applyCarveMutate(ir, new Set(["g0"]), new Set(["dkt#1"]));
    const twice = applyCarveMutate(ir, new Set(["g0"]), new Set(["dkt#1"]));
    expect(twice).toEqual(once);
  });

  it("re-deriving from baseIr with a SHRINKING deletion set yields fewer deletions", () => {
    const ir = freshIR();
    const more = applyCarveMutate(ir, new Set(["s1"]), new Set());
    expect(more.stores.map((s) => s.nodeId)).toEqual(["dkt"]); // s1 deleted

    // Restore: derive from baseIr again with the shrunk set (empty) — s1 returns.
    const fewer = applyCarveMutate(ir, new Set(), new Set());
    expect(fewer.stores.map((s) => s.nodeId)).toEqual(["dkt", "s1"]);
  });
});

describe("editorMutate — keepAll / restoreAll (empty overlay → M5 no-op)", () => {
  it("an empty overlay produces an empty patch", () => {
    const ir = freshIR();
    expect(buildCarvePatch(ir, new Set(), new Set())).toEqual({});
  });

  it("an empty overlay yields a structural copy of baseIr (deep-equal, fresh object)", () => {
    const ir = freshIR();
    const out = applyCarveMutate(ir, new Set(), new Set());
    expect(out).toEqual(ir);
    expect(out).not.toBe(ir);
  });
});
