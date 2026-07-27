// End-to-end regression for store-slot nul insertion path in
// projectWorkingCopyVfs.
//
// This file does NOT mock @keyboard-studio/engine. It exercises the real
// applyStoreSlotRemovals + applyCarveToVfs pipeline so we can observe the
// actual emitted .kmn content — proving that a store-slot deletion truly
// emits `nul` at the carved position while preserving alignment.
//
// The file must remain free of vi.mock("@keyboard-studio/engine", ...) so
// the real emission pipeline runs.
//
// AC#1: deletedItemIds = { "<dktX-nodeId>#1" } → emitted store has `nul` at pos 1;
//       body rule still present; input store unchanged.
// AC#2: One slot id + one whole-rule nodeId together → rule removed AND slot nulled.
// AC#3: baseIr not mutated.
// AC#4: A slot id on an input-only store that resolves to a coordinated
//       cross-pair (#931) → succeeds as a drop on BOTH paired stores, no warning.
// AC#4b: A slot id on a store whose positions are read by index() in a rule's
//        CONTEXT → still blocked (context-index-aligned) → warning, no crash.

import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRGroup, IRRule, IRStore, StoreItem } from "@keyboard-studio/contracts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeSimpleRule(nodeId: string, vkey: string, char: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers: [] }],
    output: [{ kind: "char", value: char }],
  };
}

function makeParallelRule(
  nodeId: string,
  dkId: number,
  inputStoreName: string,
  outputStoreName: string,
): IRRule {
  return {
    nodeId,
    context: [
      { kind: "deadkey", id: dkId },
      { kind: "any", storeRef: inputStoreName },
    ],
    output: [{ kind: "index", storeRef: outputStoreName, offset: 2 }],
  };
}

function makeGroup(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

function makeOutputStore(nodeId: string, name: string, items: StoreItem[]): IRStore {
  return { nodeId, name, items, isSystem: false };
}

function makeInputStore(nodeId: string, name: string, chars: string[]): IRStore {
  return {
    nodeId,
    name,
    items: chars.map((c) => ({ kind: "char" as const, value: c })),
    isSystem: false,
  };
}

function makeVfs(keyboardId: string) {
  return createVirtualFS([
    { path: `source/${keyboardId}.kmn`, content: "c stub\n", isBinary: false },
  ]);
}

/**
 * Build a minimal parallel-store IR for slot-beep tests.
 * Output store dktX: ['À', 'ε', raw(nul)]
 * Input store dkfX: ['a', 'b', 'c']
 * Group main: dk(003b) any(dkfX) > index(dktX, 2)
 */
function makeParallelIr(opts: {
  outputStoreNodeId?: string;
  inputStoreNodeId?: string;
  extraRules?: IRRule[];
} = {}) {
  const outputStoreNodeId = opts.outputStoreNodeId ?? "store#dkt";
  const inputStoreNodeId = opts.inputStoreNodeId ?? "store#dkf";

  const outputItems: StoreItem[] = [
    { kind: "char", value: "À" },
    { kind: "char", value: "ε" },
    { kind: "raw", text: "nul" },
  ];
  const outputStore = makeOutputStore(outputStoreNodeId, "dktX", outputItems);
  const inputStore = makeInputStore(inputStoreNodeId, "dkfX", ["a", "b", "c"]);

  const rules: IRRule[] = [
    makeParallelRule("rule#dk", 0x003b, "dkfX", "dktX"),
    ...(opts.extraRules ?? []),
  ];
  const group = makeGroup("group#main", "main", rules);
  return makeTestIR([group], [outputStore, inputStore]);
}

// ---------------------------------------------------------------------------
// AC#1: Slot-only deletion — forceEmit path
// ---------------------------------------------------------------------------

describe("projectWorkingCopyVfs store-slots end-to-end — real engine, no mock", () => {
  it("AC#1: slot deletion nulls the store at the carved position; body rule and input store survive", () => {
    const ir = makeParallelIr();
    const vfs = makeVfs("test_kb");

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["store#dkt#1"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    // No safety-gate warnings from the real pipeline
    expect(warnings).toHaveLength(0);

    const content = vfs.get("source/test_kb.kmn")?.content as string;
    expect(typeof content).toBe("string");

    // Output store dktX must contain `nul` at position 1
    // The emitted store line has the format: store(dktX) ... nul ...
    expect(content).toMatch(/store\(dktX\)[^\n]*nul/);

    // `À` at position 0 must still be present in the store line.
    // The emitter buffers consecutive char items as quoted string literals
    // (e.g. 'À') rather than U+XXXX, so we match either form.
    expect(content).toMatch(/store\(dktX\)[^\n]*(?:À|U\+00C0)/);

    // The body rule (index reference) must still be present
    expect(content).toContain("index(dktX");

    // Input store dkfX must be unchanged (contains 'a', 'b', 'c' as char items)
    expect(content).toMatch(/store\(dkfX\)/);
    // No nul in the input store line (only the output store gets nul fillers)
    const inputStoreLine = content.split("\n").find((l) => l.includes("store(dkfX)"));
    expect(inputStoreLine).toBeDefined();
    expect(inputStoreLine).not.toContain("nul");
  });

  it("AC#1 complement: empty deletedItemIds leaves VFS with the original stub content", () => {
    const ir = makeParallelIr();
    const vfs = makeVfs("test_kb");

    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    // No re-emit — original stub content unchanged
    const content = vfs.get("source/test_kb.kmn")?.content as string;
    expect(content).toBe("c stub\n");
  });

  // ---------------------------------------------------------------------------
  // AC#2: One slot id + one whole-rule nodeId together
  // ---------------------------------------------------------------------------

  it("AC#2: slot id nulled AND whole-rule nodeId removed in one call", () => {
    const extraSimpleRule = makeSimpleRule("rule#simple", "K_A", "x");
    const ir = makeParallelIr({ extraRules: [extraSimpleRule] });
    const vfs = makeVfs("test_kb");

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      // deletedItemIds carries both a slot id and a whole-rule id
      deletedItemIds: new Set(["store#dkt#1", "rule#simple"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(warnings).toHaveLength(0);

    const content = vfs.get("source/test_kb.kmn")?.content as string;
    expect(typeof content).toBe("string");

    // Slot nulled: output store contains nul
    expect(content).toMatch(/store\(dktX\)[^\n]*nul/);

    // Whole rule removed: K_A rule is gone
    expect(content).not.toContain("K_A");

    // The parallel-store body rule still present
    expect(content).toContain("index(dktX");
  });

  // ---------------------------------------------------------------------------
  // AC#3: baseIr not mutated
  // ---------------------------------------------------------------------------

  it("AC#3: baseIr is not mutated by projectWorkingCopyVfs", () => {
    const ir = makeParallelIr();
    const vfs = makeVfs("test_kb");

    const irBefore = structuredClone(ir);

    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["store#dkt#0", "store#dkt#1"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(ir).toEqual(irBefore);
  });

  // ---------------------------------------------------------------------------
  // AC#4: Input-only store slot id, resolved cross-pair → coordinated drop
  // (#931 NET UNLOCK — this dkfX/dktX shape was blocked "paired-input" under
  // the old contract; the pairing graph now resolves it and splices both
  // stores at the same position instead of refusing the edit).
  // ---------------------------------------------------------------------------

  it("AC#4: input-only store slot id whose pairing resolves succeeds as a coordinated drop on both stores; no warning", () => {
    const ir = makeParallelIr();
    const vfs = makeVfs("test_kb");

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      // store#dkf is the INPUT store, cross-paired with dktX via
      // `dk(003b) any(dkfX) > index(dktX, 2)` — dropping its slot 0 ("a")
      // coordinates a drop of dktX's slot 0 ("À") too.
      deletedItemIds: new Set(["store#dkf#0"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(warnings).toHaveLength(0);

    const content = vfs.get("source/test_kb.kmn")?.content as string;
    expect(typeof content).toBe("string");

    // "a" spliced out of dkfX entirely — no nul filler, char gone.
    const inputStoreLine = content.split("\n").find((l) => l.includes("store(dkfX)"));
    expect(inputStoreLine).toBeDefined();
    expect(inputStoreLine).not.toContain("nul");
    expect(inputStoreLine).not.toMatch(/['"]a[^'"]*['"]/);

    // "À" spliced out of the paired output store dktX at the SAME position —
    // 'ε' (was position 1) is now the alignment partner's surviving char.
    const outputStoreLine = content.split("\n").find((l) => l.includes("store(dktX)"));
    expect(outputStoreLine).toBeDefined();
    expect(outputStoreLine).not.toMatch(/À|U\+00C0/);
    expect(outputStoreLine).toMatch(/ε|U\+03B5/);
  });

  it("AC#4b: a store referenced by index() in a rule's CONTEXT is still blocked (context-index-aligned) — warning, no crash, store unchanged", () => {
    const ctxIndexStore = makeInputStore("store#ctxidx", "ctxIdxX", ["p", "q"]);
    const ctxIndexRule: IRRule = {
      nodeId: "rule#ctxidx",
      context: [{ kind: "index", storeRef: "ctxIdxX", offset: 1 }],
      output: [{ kind: "char", value: "z" }],
    };
    const group = makeGroup("group#main", "main", [ctxIndexRule]);
    const ir = makeTestIR([group], [ctxIndexStore]);
    const vfs = makeVfs("test_kb");

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["store#ctxidx#0"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes("store-slot"))).toBe(true);

    const content = vfs.get("source/test_kb.kmn")?.content;
    if (typeof content === "string") {
      const storeLine = content.split("\n").find((l) => l.includes("store(ctxIdxX)"));
      if (storeLine !== undefined) {
        expect(storeLine).toContain("p");
      }
    }
    // The test must not throw — reaching here confirms no crash.
  });

  // ---------------------------------------------------------------------------
  // #523: drop-class chip id — an UNPAIRED any()-source store (no positional
  // contract to preserve) splices the targeted char out of items[] entirely,
  // rather than nul-filling it. This is distinct from AC#4's dkfX/dktX, which
  // ARE positionally paired (via the SAME rule's index()/any() pairing) but
  // are now a coordinated DROP, not a block.
  // ---------------------------------------------------------------------------

  it("#523 drop-class: an unpaired any()-source store's chip id removal drops the char from the emitted store line", () => {
    const inputOnlyStore = makeInputStore("store#unpaired", "unpairedX", ["p", "q", "r"]);
    const simpleRule: IRRule = {
      nodeId: "rule#unpaired",
      context: [{ kind: "any", storeRef: "unpairedX" }],
      output: [{ kind: "char", value: "z" }],
    };
    const group = makeGroup("group#main", "main", [simpleRule]);
    const ir = makeTestIR([group], [inputOnlyStore]);
    const vfs = makeVfs("test_kb");

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["store#unpaired#1"]), // drop the "q"
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(warnings).toHaveLength(0);

    const content = vfs.get("source/test_kb.kmn")?.content as string;
    const storeLine = content.split("\n").find((l) => l.includes("store(unpairedX)"));
    expect(storeLine).toBeDefined();

    // The dropped char is gone entirely — no nul filler left in its place.
    expect(storeLine).not.toContain("nul");
    expect(storeLine).not.toContain("q");
    // The other two chars survive, now adjacent (spliced, not nulled).
    expect(storeLine).toMatch(/['"]pr['"]/);
  });
});
