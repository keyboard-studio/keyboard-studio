// T015 integration: the engine carve path (applyCarveToVfs with carvePipeline
// opts) and the studio mutate seam (applyCarveMutate) must derive
// byte-identical carved output from the same carve overlay + fallback policy.
//
// This file does NOT mock @keyboard-studio/engine. It exercises the real
// shared pipeline (deriveCarvedIr: suppression → slot removals → filter) on
// both routes and compares the emitted .kmn text byte-for-byte.
//
// Coverage (per the T015 acceptance criteria):
//  1. Block rule carve → owned suppression rule (`ownedByBehaviour:
//     "carve-suppression"`), present in both outputs.
//  2. Allow-host rule carve → no rule, no suppression (removed by the
//     compiler; the filter must not double-remove).
//  3. Block store-slot carve → synthesized guard present AND slot-removal
//     behavior composed (slot nulled, guard reads the pre-removal selector
//     char — the T013 constraint).
//  4. The two paths' .kmn texts are byte-identical.

import { describe, it, expect } from "vitest";
import {
  charRule,
  charStore,
  irGroup,
  makeTestIR,
  vkeyRule,
} from "@keyboard-studio/contracts/fixtures";
import type { FallbackPolicy, KeyboardIR } from "@keyboard-studio/contracts";
import { applyCarveToVfs, emitKmn } from "@keyboard-studio/engine";
import { applyCarveMutate } from "../steps/editorMutate.js";
import { stubKmnVfs } from "../test/workingCopy.ts";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/**
 * IR exercising all three T015 carve shapes in one group:
 * - `rule#blockMe`: bare vkey rule, block disposition → suppression rewrite.
 * - `store#dkt003b#1`: store slot, block disposition → guard synthesized
 *   ahead of the paired `dk(3) + any()` rule, slot nulled by the pipeline.
 *   The `+` puts the `any()` in the key position; only key-side slots get a
 *   guard (a context-side slot is just removed).
 * - `lead`: untouched control rule.
 */
function carvePipelineFixture(): KeyboardIR {
  return makeTestIR({
    stores: [
      charStore({
        nodeId: "store#dkf003b",
        name: "dkf003b",
        chars: ["e", "E"],
      }),
      charStore({
        nodeId: "store#dkt003b",
        name: "dkt003b",
        chars: ["é", "É"],
      }),
    ],
    groups: [
      irGroup({
        nodeId: "group#main",
        rules: [
          vkeyRule({ nodeId: "rule#blockMe", vkey: "K_A", output: "a" }),
          charRule({ nodeId: "lead", context: "z", output: "z" }),
          charRule({
            nodeId: "paired",
            context: [
              { kind: "deadkey", id: 3 },
              { kind: "raw", text: "+" },
              { kind: "any", storeRef: "dkf003b" },
            ],
            output: [{ kind: "index", storeRef: "dkt003b", offset: 2 }],
          }),
        ],
      }),
    ],
  });
}

const DELETED_NODE_IDS = new Set(["rule#blockMe"]);
const DELETED_ITEM_IDS = new Set(["store#dkt003b#1"]);

/** Engine path: applyCarveToVfs with the T015 carvePipeline opts. */
function enginePath(startIr: KeyboardIR, fallbackPolicy: FallbackPolicy = "swallow"): string {
  const vfs = stubKmnVfs("test");
  const result = applyCarveToVfs(vfs, "test", startIr, DELETED_NODE_IDS, {
    carvePipeline: {
      deletedItemIds: DELETED_ITEM_IDS,
      fallbackPolicy,
      loud: false,
    },
  });
  expect(result.warnings).toEqual([]);
  const kmn = vfs.get("source/test.kmn");
  expect(kmn).toBeDefined();
  return kmn!.content as string;
}

/** Studio path: the mutate seam, then emit. */
function seamPath(startIr: KeyboardIR, fallbackPolicy: FallbackPolicy = "swallow"): string {
  const seamIr = applyCarveMutate(
    startIr,
    DELETED_NODE_IDS,
    DELETED_ITEM_IDS,
    undefined,
    {
      fallbackPolicy,
      loud: false,
    },
  );
  return emitKmn(seamIr);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("T015 carve pipeline parity: engine path vs mutate seam", () => {
  it("produces byte-identical .kmn output on both paths", () => {
    const startIr = carvePipelineFixture();
    expect(enginePath(startIr)).toBe(seamPath(startIr));
  });

  it("block rule carve → owned suppression rule (not removed)", () => {
    const kmn = enginePath(carvePipelineFixture());
    // The block disposition rewrites `rule#blockMe` in place to `> nul`
    // (bare-key shape) and stamps it; the whole-node filter must not undo
    // the rewrite even though the rule's nodeId is in the deletion set.
    expect(kmn).toContain("nul");
    // The suppression rule survives in the emitted text (not filtered out).
    const seamIr = applyCarveMutate(
      carvePipelineFixture(),
      DELETED_NODE_IDS,
      DELETED_ITEM_IDS,
      undefined,
      { fallbackPolicy: "swallow", loud: false },
    );
    const suppressed = seamIr.groups[0]!.rules.find(
      (r) => r.nodeId === "rule#blockMe",
    );
    expect(suppressed).toBeDefined();
    expect(suppressed!.ownedByBehaviour).toBe("carve-suppression");
    expect(suppressed!.output).toEqual([{ kind: "nul" }]);
  });

  it("pass-through policy → carved rule removed, no suppression, slot has no guard", () => {
    const seamIr = applyCarveMutate(
      carvePipelineFixture(),
      DELETED_NODE_IDS,
      DELETED_ITEM_IDS,
      undefined,
      { fallbackPolicy: "pass-through", loud: false },
    );
    const rules = seamIr.groups[0]!.rules;
    expect(rules.map((r) => r.nodeId)).not.toContain("rule#blockMe");
    expect(rules.filter((r) => r.ownedByBehaviour === "carve-suppression")).toHaveLength(0);
    // Byte-identical on both paths.
    expect(enginePath(carvePipelineFixture(), "pass-through")).toBe(
      seamPath(carvePipelineFixture(), "pass-through"),
    );
  });

  it("block store-slot carve → guard present and slot removal composed", () => {
    const seamIr = applyCarveMutate(
      carvePipelineFixture(),
      DELETED_NODE_IDS,
      DELETED_ITEM_IDS,
      undefined,
      { fallbackPolicy: "swallow", loud: false },
    );
    const rules = seamIr.groups[0]!.rules;
    // The guard is synthesized immediately ahead of the paired rule with the
    // pre-removal selector char ("E", the pair-set peer of carved "É").
    const guardIndex = rules.findIndex((r) =>
      r.nodeId.startsWith("gen-carve-guard-"),
    );
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    const guard = rules[guardIndex]!;
    expect(guard.ownedByBehaviour).toBe("carve-suppression");
    expect(guard.context).toEqual([
      { kind: "deadkey", id: 3 },
      { kind: "raw", text: "+" },
      { kind: "char", value: "E" },
    ]);
    expect(rules[guardIndex + 1]!.nodeId).toBe("paired");
    // The pipeline's slot-removal stage ran: for the coordinated
    // `dkf003b`/`dkt003b` pair-set, carving slot 1 drops index 1 from BOTH
    // stores (coordinated drop, never nul-fill — the T013 interior-padding
    // ban holds because the compiler never pads stores itself).
    const outputStore = seamIr.stores.find(
      (s) => s.nodeId === "store#dkt003b",
    )!;
    expect(outputStore.items).toHaveLength(1);
    expect(outputStore.items[0]).toEqual({ kind: "char", value: "é" });
    const inputStore = seamIr.stores.find((s) => s.nodeId === "store#dkf003b")!;
    expect(inputStore.items).toHaveLength(1);
    expect(inputStore.items[0]).toEqual({ kind: "char", value: "e" });
    // Byte-identical on both paths.
    expect(enginePath(carvePipelineFixture())).toBe(
      seamPath(carvePipelineFixture()),
    );
  });

  it("does not mutate the base IR on either path", () => {
    const startIr = carvePipelineFixture();
    const before = JSON.stringify(startIr);
    enginePath(startIr);
    applyCarveMutate(startIr, DELETED_NODE_IDS, DELETED_ITEM_IDS, undefined, {
      fallbackPolicy: "swallow",
      loud: false,
    });
    expect(JSON.stringify(startIr)).toBe(before);
  });
});
