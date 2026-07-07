// End-to-end regression for the store-slot coordinated-drop path in
// projectWorkingCopyVfs.
//
// This file does NOT mock @keyboard-studio/engine. It exercises the real
// applyStoreSlotRemovals + applyCarveToVfs pipeline so we can observe the
// actual emitted .kmn content — proving that a store-slot deletion on the
// output side of a parallel-store deadkey pair splices BOTH the output and
// its positionally-paired input store at the same index (the pairing-graph
// fix), and that no NEW interior nul is ever introduced.
//
// The file must remain free of vi.mock("@keyboard-studio/engine", ...) so
// the real emission pipeline runs.
//
// AC#1: deletedItemIds = { "<dktX-nodeId>#1" } → the char at pos 1 is spliced
//       out of dktX AND, because dktX is positionally paired with dkfX via the
//       parallel deadkey rule, the same position is spliced out of dkfX too;
//       body rule still present; no NEW nul introduced.
// AC#2: One slot id + one whole-rule nodeId together → rule removed AND the
//       coordinated drop applied.
// AC#3: baseIr not mutated.
// AC#4: A slot id whose left part is the INPUT store (dkfX) now WORKS (this is
//       exactly the "Matt directive" fix) — it coordinates the same drop on
//       dktX, rather than being blocked as dual-use.

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
  it("AC#1: slot deletion coordinates a drop across the paired output+input stores; body rule survives; no NEW nul appears", () => {
    const ir = makeParallelIr();
    const vfs = makeVfs("test_kb");

    const { warnings, notices } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["store#dkt#1"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    // The coordinated-removal notice is informational, not a safety-gate warning.
    expect(warnings).toHaveLength(0);
    expect(notices.some((n) => n.includes("coordinated removal"))).toBe(true);

    const content = vfs.get("source/test_kb.kmn")?.content as string;
    expect(typeof content).toBe("string");

    // dktX started as ['À', 'ε', raw(nul)]; dropping position 1 (ε) leaves
    // ['À', raw(nul)] — the trailing nul is PRE-EXISTING padding, not a new
    // interior nul introduced by this removal.
    expect(content).toMatch(/store\(dktX\) 'À' nul/);

    // The body rule (index reference) must still be present
    expect(content).toContain("index(dktX");

    // dkfX started as ['a', 'b', 'c']; the pairing graph coordinates the SAME
    // position (1, 'b') out of it too, leaving ['a', 'c'] — no nul filler,
    // spliced not nulled.
    const inputStoreLine = content.split("\n").find((l) => l.includes("store(dkfX)"));
    expect(inputStoreLine).toBeDefined();
    expect(inputStoreLine).not.toContain("nul");
    expect(inputStoreLine).not.toContain("b");
    expect(inputStoreLine).toMatch(/['"]ac['"]/);
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

  it("AC#2: slot id coordinated-dropped AND whole-rule nodeId removed in one call", () => {
    const extraSimpleRule = makeSimpleRule("rule#simple", "K_A", "x");
    const ir = makeParallelIr({ extraRules: [extraSimpleRule] });
    const vfs = makeVfs("test_kb");

    const { notices } = projectWorkingCopyVfs({
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

    expect(notices.some((n) => n.includes("coordinated removal"))).toBe(true);

    const content = vfs.get("source/test_kb.kmn")?.content as string;
    expect(typeof content).toBe("string");

    // Slot coordinated-dropped: output store's pre-existing trailing nul survives.
    expect(content).toMatch(/store\(dktX\) 'À' nul/);

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
  // AC#4: Input-only store slot id → warning, no crash, emitted store unchanged
  // ---------------------------------------------------------------------------

  it("AC#4: targeting the INPUT store's slot now coordinates the same drop on the paired output store (the Matt-directive fix; previously blocked as dual-use)", () => {
    const ir = makeParallelIr();
    const vfs = makeVfs("test_kb");

    const { warnings, notices } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: ir,
      deletedNodeIds: new Set(),
      // store#dkf is the INPUT store — targeting it directly must now work,
      // coordinating the same position out of the paired OUTPUT store too.
      deletedItemIds: new Set(["store#dkf#0"]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(notices.some((n) => n.includes("coordinated removal"))).toBe(true);
    expect(warnings.some((w) => w.includes("blocked from editing"))).toBe(false);

    const content = vfs.get("source/test_kb.kmn")?.content as string;
    expect(typeof content).toBe("string");

    // dkfX started as ['a', 'b', 'c']; dropping position 0 leaves ['b', 'c'].
    const inputStoreLine = content.split("\n").find((l) => l.includes("store(dkfX)"));
    expect(inputStoreLine).toBeDefined();
    expect(inputStoreLine).toMatch(/['"]bc['"]/);

    // dktX started as ['À', 'ε', raw(nul)]; the pairing graph coordinates the
    // SAME position (0, 'À') out of it too, leaving ['ε', raw(nul)].
    const outputStoreLine = content.split("\n").find((l) => l.includes("store(dktX)"));
    expect(outputStoreLine).toBeDefined();
    expect(outputStoreLine).not.toContain("À");
    expect(outputStoreLine).toMatch(/store\(dktX\) 'ε' nul/);
  });

  // ---------------------------------------------------------------------------
  // #523: drop-class chip id — an UNPAIRED any()-source store (no positional
  // contract to preserve) splices the targeted char out of items[] entirely,
  // rather than nul-filling it. This is distinct from AC#4's dkfX, which is
  // PAIRED with an output index() in the same rule and is therefore blocked.
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
