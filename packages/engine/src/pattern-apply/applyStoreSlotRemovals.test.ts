// Tests for applyStoreSlotRemovals — the pairing-graph + coordinated-drop
// store-slot edit dispatch (drop or blocked) for carving individual
// characters out of a store.
//
// Coverage:
//   1.  Self-paired drop (word-style: a store paired with ITSELF via its own
//       any() context source) — single slot, multiple slots, baseIr not mutated.
//   2.  Cross-paired coordinated drop (dkf/dkt-style parallel-store deadkey) —
//       single slot, dropping a nul PARTNER slot, structural sharing of
//       untouched stores.
//   3.  Descending / out-of-order multi-position splice safety.
//   4.  Would-empty refusal — single store and coordinated pair-set, vs. the
//       legal any()-unreferenced-empty case.
//   5.  NO interior nul is ever produced by any carve path (round-trip proof).
//   6.  Ambiguous / unresolved index() pairing — still blocked, conservatively.
//   7.  classifyStoreSlotEdit decision table — one case per class, incl.
//       outs()-reference fail-closed (direct + pair-set propagation +
//       unaffected-when-not-referenced).
//   7b. describeStorePairing — none/self/cross/unresolved display cases,
//       incl. the 2-any()/2-index() rule (two independent self-pairs, not a
//       cross-pair — the canonical detectStorePairs regression shape).
//   8.  Guards: system-store, notany-widens, context-index-aligned; the
//       drop-guard relaxation for a coordinated partner's non-char item.
//   9.  End-to-end dispatch across a batch spanning multiple classes at once.
//   10. Canaries against the real sibling keyboards checkout (skipped if absent).
//   11. Cameroon-shaped integration test against a trimmed embedded fixture.

import { describe, it, expect } from "vitest";
import {
  applyStoreSlotRemovals,
  classifyStoreSlotEdit,
  describeStorePairing,
} from "./applyStoreSlotRemovals.js";
import { collectCharContributors } from "./collectCharContributors.js";
import { parseSlotId } from "./slotId.js";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR, IRStore, IRGroup, IRRule, StoreItem } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Output store with a mix of char, nul items. */
function makeOutputStore(nodeId: string, name: string, items: StoreItem[]): IRStore {
  return { nodeId, name, items, isSystem: false };
}

/** Input store (char-only items). */
function makeInputStore(nodeId: string, name: string, chars: string[]): IRStore {
  return {
    nodeId,
    name,
    items: chars.map((c) => ({ kind: "char" as const, value: c })),
    isSystem: false,
  };
}

/**
 * A group containing a parallel-store deadkey rule:
 *   dk(id) any(inputStoreName) > index(outputStoreName, 2)
 * This is a CROSS-pair: the rule's context is [deadkey, any(inputStoreName)],
 * so offset 2 resolves to any(inputStoreName) — pairing inputStoreName with
 * outputStoreName.
 */
function makeParallelStoreGroup(
  groupNodeId: string,
  ruleNodeId: string,
  dkId: number,
  inputStoreName: string,
  outputStoreName: string,
): IRGroup {
  const rule: IRRule = {
    nodeId: ruleNodeId,
    context: [
      { kind: "deadkey", id: dkId },
      { kind: "any", storeRef: inputStoreName },
    ],
    output: [{ kind: "index", storeRef: outputStoreName, offset: 2 }],
  };
  return { nodeId: groupNodeId, name: "main", usingKeys: true, rules: [rule], readonly: false };
}

/**
 * Minimal CROSS-paired IR: one output store dktX, one input store dkfX,
 * and a rule: dk(0x003b) any(dkfX) > index(dktX, 2).
 *
 * Output store items: ['À', 'ε', raw(nul), raw(nul)] — a char before AND
 * after non-char items, so index-vs-position tests are non-vacuous.
 */
function makeBaseIr(
  outputStoreNodeId = "store#dkt",
  inputStoreNodeId = "store#dkf",
): KeyboardIR {
  const outputItems: StoreItem[] = [
    { kind: "char", value: "À" }, // index 0
    { kind: "char", value: "ε" }, // index 1
    { kind: "raw", text: "nul" }, // index 2 (pre-existing trailing padding)
    { kind: "raw", text: "nul" }, // index 3 (pre-existing trailing padding)
  ];
  const outputStore = makeOutputStore(outputStoreNodeId, "dktX", outputItems);
  const inputStore = makeInputStore(inputStoreNodeId, "dkfX", ["a", "b", "c", "d"]);
  const group = makeParallelStoreGroup("group#main", "rule#0", 0x003b, "dkfX", "dktX");
  return makeTestIR([group], [outputStore, inputStore]);
}

/**
 * A SELF-paired IR (Cameroon's `word` shape): one store used as BOTH the
 * any() context source AND the index() output target of the SAME rule, at
 * the position its own any() occupies — so it pairs with itself, and a
 * coordinated drop only ever touches the one store.
 */
function makeSelfPairedIr(storeNodeId = "store#word"): KeyboardIR {
  const items: StoreItem[] = [
    { kind: "char", value: "a" },
    { kind: "char", value: "ɛ" },
    { kind: "char", value: "b" },
    { kind: "char", value: "Ɛ" },
    { kind: "char", value: "z" },
  ];
  const store = makeOutputStore(storeNodeId, "word", items);
  const rule: IRRule = {
    nodeId: "rule#self",
    context: [{ kind: "any", storeRef: "word" }],
    output: [{ kind: "index", storeRef: "word", offset: 1 }],
  };
  const group: IRGroup = { nodeId: "group#main", name: "main", usingKeys: true, rules: [rule], readonly: false };
  return makeTestIR([group], [store]);
}

const NUL: StoreItem = { kind: "raw", text: "nul" };

// ---------------------------------------------------------------------------
// 1. Self-paired drop (word-style)
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — self-paired drop (a store paired with itself)", () => {
  it("drops a single slot from a self-paired store; no coordination warning (only one store involved)", () => {
    const ir = makeSelfPairedIr();
    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#word#1"]), // ɛ
    );

    expect(appliedCount).toBe(1);
    expect(warnings.some((w) => w.includes("coordinated removal"))).toBe(false);

    const store = result.stores.find((s) => s.nodeId === "store#word");
    expect(store!.items).toEqual([
      { kind: "char", value: "a" },
      { kind: "char", value: "b" },
      { kind: "char", value: "Ɛ" },
      { kind: "char", value: "z" },
    ]);
  });

  it("drops multiple slots from a self-paired store in one call", () => {
    const ir = makeSelfPairedIr();
    const { ir: result, appliedCount, warnings } = applyStoreSlotRemovals(
      ir,
      new Set(["store#word#1", "store#word#3"]), // ɛ and Ɛ
    );

    expect(appliedCount).toBe(2);
    expect(warnings).toHaveLength(0);

    const store = result.stores.find((s) => s.nodeId === "store#word");
    expect(store!.items).toEqual([
      { kind: "char", value: "a" },
      { kind: "char", value: "b" },
      { kind: "char", value: "z" },
    ]);
  });

  it("classifies a self-paired store as drop with an EMPTY coordinatedWith (no other store to splice)", () => {
    const ir = makeSelfPairedIr();
    const store = ir.stores.find((s) => s.nodeId === "store#word")!;
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "drop", coordinatedWith: [] });
  });

  it("baseIr is not mutated", () => {
    const ir = makeSelfPairedIr();
    const before = structuredClone(ir);
    applyStoreSlotRemovals(ir, new Set(["store#word#1"]));
    expect(ir).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// 2. Cross-paired coordinated drop (dkf/dkt-style)
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — cross-paired coordinated drop", () => {
  it("classifies the output store as drop, coordinated with its paired input store", () => {
    const ir = makeBaseIr();
    const store = ir.stores.find((s) => s.nodeId === "store#dkt")!;
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "drop", coordinatedWith: ["dkfX"] });
  });

  it("classifies the input store (formerly blocked as paired-input/dual-use) as drop, coordinated with the output store — the Matt-directive fix", () => {
    const ir = makeBaseIr();
    const store = ir.stores.find((s) => s.nodeId === "store#dkf")!;
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "drop", coordinatedWith: ["dktX"] });
  });

  it("dropping a slot from the OUTPUT store also splices the SAME position out of the paired INPUT store", () => {
    const ir = makeBaseIr();
    const { ir: result, warnings, notices, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkt#0"]), // À
    );

    expect(appliedCount).toBe(2); // one item removed from EACH of the two paired stores
    expect(warnings).toHaveLength(0); // the success notice is NOT a warning
    expect(notices.some((n) => n.includes("coordinated removal") && n.includes("dktX") && n.includes("dkfX"))).toBe(true);

    const outStore = result.stores.find((s) => s.nodeId === "store#dkt");
    const inStore = result.stores.find((s) => s.nodeId === "store#dkf");
    expect(outStore!.items).toEqual([{ kind: "char", value: "ε" }, NUL, NUL]);
    expect(inStore!.items).toEqual([
      { kind: "char", value: "b" },
      { kind: "char", value: "c" },
      { kind: "char", value: "d" },
    ]);
  });

  it("dropping a slot from the INPUT store also splices the SAME position out of the paired OUTPUT store (previously blocked entirely)", () => {
    const ir = makeBaseIr();
    const { ir: result, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkf#0"]), // a
    );

    expect(appliedCount).toBe(2);
    const outStore = result.stores.find((s) => s.nodeId === "store#dkt");
    const inStore = result.stores.find((s) => s.nodeId === "store#dkf");
    // dktX loses position 0 (À) — the coordinated partner of dkfX's dropped 'a'.
    expect(outStore!.items).toEqual([{ kind: "char", value: "ε" }, NUL, NUL]);
    expect(inStore!.items).toEqual([
      { kind: "char", value: "b" },
      { kind: "char", value: "c" },
      { kind: "char", value: "d" },
    ]);
  });

  it("dropping a char slot is free to take a NUL coordinated-partner slot with it, even though the partner item is not a char", () => {
    // Target position 2, where dktX holds a pre-existing nul filler and
    // dkfX holds a real char ('c'). The user drops dkfX's char at 2; the
    // guard must allow dktX's nul partner to be spliced along with it.
    const ir = makeBaseIr();
    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkf#2"]), // c
    );

    expect(appliedCount).toBe(2);
    expect(warnings.some((w) => w.includes("not a char item"))).toBe(false);

    const outStore = result.stores.find((s) => s.nodeId === "store#dkt");
    const inStore = result.stores.find((s) => s.nodeId === "store#dkf");
    // dktX's nul at position 2 is gone; the char at 0/1 and the OTHER nul (was at 3) survive.
    expect(outStore!.items).toEqual([
      { kind: "char", value: "À" },
      { kind: "char", value: "ε" },
      NUL,
    ]);
    expect(inStore!.items).toEqual([
      { kind: "char", value: "a" },
      { kind: "char", value: "b" },
      { kind: "char", value: "d" },
    ]);
  });

  it("if the DIRECTLY-requested slot itself is not a char, the position is skipped for the whole pair-set (no partial splice)", () => {
    const ir = makeBaseIr();
    // Target dktX position 2, which is itself a nul (not a char) — this IS the
    // directly-requested slot, so the char-kind guard still applies to it.
    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkt#2"]),
    );

    expect(appliedCount).toBe(0);
    expect(warnings.some((w) => w.includes("not a char item"))).toBe(true);
    expect(result).toBe(ir);
  });

  it("structural sharing: an unrelated third store keeps the same object reference through a coordinated drop", () => {
    const ir = makeBaseIr();
    const orphan: IRStore = { nodeId: "store#orphan", name: "orphanX", items: [{ kind: "char", value: "q" }], isSystem: false };
    const irWithOrphan: KeyboardIR = { ...ir, stores: [...ir.stores, orphan] };

    const { ir: result } = applyStoreSlotRemovals(irWithOrphan, new Set(["store#dkt#0"]));

    const orphanInResult = result.stores.find((s) => s.nodeId === "store#orphan");
    expect(orphanInResult).toBe(orphan);
  });
});

// ---------------------------------------------------------------------------
// 3. Descending / out-of-order multi-position splice safety
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — multi-position splice safety", () => {
  it("removes multiple positions targeted out of ascending order identically on both paired stores", () => {
    const ir = makeBaseIr();
    // Target indices out of ascending order to prove the filter approach
    // (not manual splicing) handles this correctly regardless of Set iteration order.
    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkt#2", "store#dkt#0"]), // nul at 2, À at 0
    );

    // dktX#2 is a nul (not directly requested to be a char at that slot — it
    // IS the directly-requested slot here, so it must be a char). It is not,
    // so THAT position is rejected; only position 0 (À) survives validation.
    expect(warnings.some((w) => w.includes("not a char item"))).toBe(true);
    expect(appliedCount).toBe(2); // one position × two paired stores

    const outStore = result.stores.find((s) => s.nodeId === "store#dkt");
    const inStore = result.stores.find((s) => s.nodeId === "store#dkf");
    expect(outStore!.items).toEqual([{ kind: "char", value: "ε" }, NUL, NUL]);
    expect(inStore!.items).toEqual([
      { kind: "char", value: "b" },
      { kind: "char", value: "c" },
      { kind: "char", value: "d" },
    ]);
  });

  it("multiple drops in one self-paired store in one pass (descending-index safety)", () => {
    const store: IRStore = {
      nodeId: "s#multi",
      name: "multiStore",
      items: [
        { kind: "char", value: "a" }, // 0
        { kind: "char", value: "b" }, // 1
        { kind: "char", value: "c" }, // 2
        { kind: "char", value: "d" }, // 3
        { kind: "char", value: "e" }, // 4
      ],
      isSystem: false,
    };
    const ir = makeTestIR([], [store]);

    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["s#multi#3", "s#multi#0", "s#multi#2"]),
    );

    expect(warnings).toHaveLength(0);
    expect(appliedCount).toBe(3);
    const resultStore = result.stores.find((s) => s.nodeId === "s#multi");
    // Indices 0, 2, 3 dropped; only 1 ('b') and 4 ('e') remain, in original relative order.
    expect(resultStore!.items).toEqual([
      { kind: "char", value: "b" },
      { kind: "char", value: "e" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 4. Would-empty refusal
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — would-empty refusal", () => {
  it("refuses to empty a single any()-referenced store: IR unchanged, not counted, warns with the oracle-based message", () => {
    const store: IRStore = {
      nodeId: "s#last",
      name: "lastStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "any", storeRef: "lastStore" }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);

    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["s#last#0"]),
    );

    expect(appliedCount).toBe(0);
    const resultStore = result.stores.find((s) => s.nodeId === "s#last");
    expect(resultStore).toBe(store);
    expect(
      warnings.some((w) =>
        w.includes(
          'refusing to empty store "lastStore" - a store consumed by any() compiles to a keyboard that silently fails to build when empty; remove the whole store and its rules instead',
        ),
      ),
    ).toBe(true);
  });

  it("refuses a COORDINATED drop that would empty either member of a cross-paired pair-set when one is any()-consumed — no partial application", () => {
    // A one-element cross-pair: dropping the sole position would empty BOTH
    // dkt (index target) and dkf (any()-consumed) — refuse entirely.
    const outStore = makeOutputStore("store#dkt", "dktX", [{ kind: "char", value: "z" }]);
    const inStore = makeInputStore("store#dkf", "dkfX", ["a"]);
    const group = makeParallelStoreGroup("group#main", "rule#0", 0x003b, "dkfX", "dktX");
    const ir = makeTestIR([group], [outStore, inStore]);

    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkt#0"]),
    );

    expect(appliedCount).toBe(0);
    // No partial application: NEITHER store changed, by reference.
    expect(result.stores.find((s) => s.nodeId === "store#dkt")).toBe(outStore);
    expect(result.stores.find((s) => s.nodeId === "store#dkf")).toBe(inStore);
    expect(
      warnings.some(
        (w) => w.includes("refusing coordinated removal") && w.includes("dkfX") && w.includes("dktX"),
      ),
    ).toBe(true);
  });

  it("applies emptying an UNREFERENCED store: drop goes through, items[] ends up empty, no refusal warning", () => {
    const store: IRStore = {
      nodeId: "s#orphanlast",
      name: "orphanLastStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const ir = makeTestIR([], [store]);

    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["s#orphanlast#0"]),
    );

    expect(appliedCount).toBe(1);
    expect(warnings.some((w) => w.includes("refusing"))).toBe(false);
    const resultStore = result.stores.find((s) => s.nodeId === "s#orphanlast");
    expect(resultStore!.items).toEqual([]);
  });

  it("dropping all-but-one char in an any()-referenced store still applies (only the empty-result batch is refused)", () => {
    const store: IRStore = {
      nodeId: "s#allbutone",
      name: "allButOneStore",
      items: [
        { kind: "char", value: "a" },
        { kind: "char", value: "b" },
        { kind: "char", value: "c" },
      ],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "any", storeRef: "allButOneStore" }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);

    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["s#allbutone#0", "s#allbutone#1"]),
    );

    expect(appliedCount).toBe(2);
    const resultStore = result.stores.find((s) => s.nodeId === "s#allbutone");
    expect(resultStore!.items).toEqual([{ kind: "char", value: "c" }]);
    expect(warnings.some((w) => w.includes("refusing"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. NO interior nul is ever produced by any carve path
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — never produces an interior nul", () => {
  it("round-trip: dropping a cross-paired slot never introduces a nul; pre-existing trailing nuls survive, shifted", () => {
    const kmnText = [
      "c Round-trip test for coordinated drop — proves no filler item is introduced",
      "store(VERSION) \"10.0\"",
      "store(NAME) \"RoundTripTest\"",
      "store(TARGETS) \"any\"",
      "store(dkfRt) U+0061 U+0062 U+0063",
      "store(dktRt) U+00E0 U+00E2 U+00E8",
      "",
      "begin Unicode > use(main)",
      "",
      "group(main) using keys",
      "dk(003b) any(dkfRt) > index(dktRt, 2)",
    ].join("\n");

    const { ir: parsedIr, warnings: parseWarnings } = parse(kmnText, "rt_test");
    expect(parseWarnings ?? []).toHaveLength(0);
    expect(parsedIr.raw.length).toBe(0);

    const dktStore = parsedIr.stores.find((s) => s.name === "dktRt");
    const dkfStore = parsedIr.stores.find((s) => s.name === "dkfRt");
    expect(dktStore).toBeDefined();
    expect(dkfStore).toBeDefined();

    // Drop items[1] (â, U+00E2) — coordinated with dkfRt's items[1] (b).
    const { ir: droppedIr, appliedCount } = applyStoreSlotRemovals(
      parsedIr,
      new Set([`${dktStore!.nodeId}#1`]),
    );
    expect(appliedCount).toBe(2);

    const emitted = emit(droppedIr);
    // The FIX: no filler token on EITHER store's line — this pattern used to
    // nul-fill the target slot; now it splices both paired stores instead.
    const dktLine = emitted.split("\n").find((l) => l.includes("store(dktRt)"));
    const dkfLine = emitted.split("\n").find((l) => l.includes("store(dkfRt)"));
    expect(dktLine).toBeDefined();
    expect(dkfLine).toBeDefined();
    expect(dktLine).not.toContain("nul");
    expect(dkfLine).not.toContain("nul");

    const { ir: reparsed } = parse(emitted, "rt_test");
    const reparsedDkt = reparsed.stores.find((s) => s.name === "dktRt");
    const reparsedDkf = reparsed.stores.find((s) => s.name === "dkfRt");
    expect(reparsedDkt).toBeDefined();
    expect(reparsedDkf).toBeDefined();

    // Both stores shrank by exactly one item, staying equal length (Layer-A
    // check #9: index-target length >= any()-source length is preserved
    // automatically because both sides are spliced together).
    expect(reparsedDkt!.items).toEqual([
      { kind: "char", value: "à" },
      { kind: "char", value: "è" },
    ]);
    expect(reparsedDkf!.items).toEqual([
      { kind: "char", value: "a" },
      { kind: "char", value: "c" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 6. Ambiguous / unresolved index() pairing — blocked conservatively
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — unresolved index() pairing is blocked conservatively", () => {
  it("blocks a store whose index()-output rule has no any() at the resolved offset (offset points at a vkey, not an any())", () => {
    const store: IRStore = {
      nodeId: "s#out",
      name: "outStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "index", storeRef: "outStore", offset: 1 }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);

    expect(classifyStoreSlotEdit(store, ir)).toEqual({
      mode: "blocked",
      reason: "unresolved-index-pairing",
    });

    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(ir, new Set(["s#out#0"]));
    expect(appliedCount).toBe(0);
    expect(result).toBe(ir);
    expect(
      warnings.some(
        (w) => w.includes('store "outStore"') && w.includes("blocked from editing") && w.includes("pairing"),
      ),
    ).toBe(true);
  });

  it("blocks a store whose index()-output offset is out of range for its own rule's context", () => {
    const store: IRStore = {
      nodeId: "s#out",
      name: "outStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "any", storeRef: "inStore" }],
      output: [{ kind: "index", storeRef: "outStore", offset: 5 }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);

    expect(classifyStoreSlotEdit(store, ir)).toEqual({
      mode: "blocked",
      reason: "unresolved-index-pairing",
    });
  });

  it("a genuinely-ambiguous dual role (output-index in one rule with no any() of its own, any()-source in an unrelated rule) stays blocked", () => {
    const store: IRStore = {
      nodeId: "s#dual",
      name: "dualStore",
      items: [{ kind: "char", value: "a" }, { kind: "char", value: "b" }],
      isSystem: false,
    };
    // This rule's OWN context has no any() at all — index(dualStore, 1) can
    // never resolve a pairing from here.
    const ruleEmit: IRRule = {
      nodeId: "rule#emit",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "index", storeRef: "dualStore", offset: 1 }],
    };
    const ruleSource: IRRule = {
      nodeId: "rule#source",
      context: [{ kind: "any", storeRef: "dualStore" }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = {
      nodeId: "g#0",
      name: "main",
      usingKeys: true,
      rules: [ruleEmit, ruleSource],
      readonly: false,
    };
    const ir = makeTestIR([group], [store]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "blocked", reason: "unresolved-index-pairing" });
  });

  it("propagates the block to every member of a pair-set: a store paired with an unresolved store is blocked too", () => {
    // storeB is targeted by index() in a rule whose context has no any() (unresolved).
    // In a DIFFERENT rule, storeB's own any() pairs it with storeC — but storeB's
    // unresolved status must still block the WHOLE pair-set {storeB, storeC}.
    const storeB: IRStore = { nodeId: "s#b", name: "storeB", items: [{ kind: "char", value: "b" }], isSystem: false };
    const storeC: IRStore = { nodeId: "s#c", name: "storeC", items: [{ kind: "char", value: "c" }], isSystem: false };
    const unresolvedRule: IRRule = {
      nodeId: "rule#unresolved",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "index", storeRef: "storeB", offset: 1 }],
    };
    const pairingRule: IRRule = {
      nodeId: "rule#pairing",
      context: [{ kind: "any", storeRef: "storeB" }],
      output: [{ kind: "index", storeRef: "storeC", offset: 1 }],
    };
    const group: IRGroup = {
      nodeId: "g#0",
      name: "main",
      usingKeys: true,
      rules: [unresolvedRule, pairingRule],
      readonly: false,
    };
    const ir = makeTestIR([group], [storeB, storeC]);

    expect(classifyStoreSlotEdit(storeC, ir)).toEqual({ mode: "blocked", reason: "unresolved-index-pairing" });
  });
});

// ---------------------------------------------------------------------------
// 7. classifyStoreSlotEdit — one unit case per class in the decision table
// ---------------------------------------------------------------------------

describe("classifyStoreSlotEdit — decision table", () => {
  it("blocks a system store (isSystem: true) regardless of usage", () => {
    const store: IRStore = { nodeId: "s#0", name: "NAME", items: [], isSystem: true };
    const ir = makeTestIR([], [store]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({
      mode: "blocked",
      reason: "system-store",
    });
  });

  it("blocks a store referenced by notany() (dropping would widen matching)", () => {
    const store: IRStore = {
      nodeId: "s#word",
      name: "word",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "notany", storeRef: "word" }],
      output: [{ kind: "char", value: "x" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({
      mode: "blocked",
      reason: "notany-widens",
    });
  });

  it("blocks a store referenced by index() in a rule's context", () => {
    const store: IRStore = {
      nodeId: "s#ctx",
      name: "ctxStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "index", storeRef: "ctxStore", offset: 1 }],
      output: [{ kind: "char", value: "x" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({
      mode: "blocked",
      reason: "context-index-aligned",
    });
  });

  it("drops a store referenced only by an unpaired any() (no index() anywhere in that rule's output)", () => {
    const store: IRStore = {
      nodeId: "s#any",
      name: "anyStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "any", storeRef: "anyStore" }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "drop", coordinatedWith: [] });
  });

  it("blocks a store referenced via outs() in some rule's output (Amendment 4, fail-closed)", () => {
    const store: IRStore = {
      nodeId: "s#outs",
      name: "outsStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "outs", storeRef: "outsStore" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({
      mode: "blocked",
      reason: "outs-reference-unanalyzed",
    });
  });

  it("propagates the outs()-reference block across the whole pair-set", () => {
    // storeA is paired with storeB via index()/any() in rule#pair, and storeB
    // (only) is separately referenced by outs() in rule#outs. Editing EITHER
    // storeA or storeB must block, because a coordinated drop touches both.
    const storeA: IRStore = {
      nodeId: "s#a",
      name: "storeA",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const storeB: IRStore = {
      nodeId: "s#b",
      name: "storeB",
      items: [{ kind: "char", value: "b" }],
      isSystem: false,
    };
    const rulePair: IRRule = {
      nodeId: "rule#pair",
      context: [{ kind: "any", storeRef: "storeA" }],
      output: [{ kind: "index", storeRef: "storeB", offset: 1 }],
    };
    const ruleOuts: IRRule = {
      nodeId: "rule#outs",
      context: [{ kind: "vkey", name: "K_B", modifiers: [] }],
      output: [{ kind: "outs", storeRef: "storeB" }],
    };
    const group: IRGroup = {
      nodeId: "g#0",
      name: "main",
      usingKeys: true,
      rules: [rulePair, ruleOuts],
      readonly: false,
    };
    const ir = makeTestIR([group], [storeA, storeB]);
    expect(classifyStoreSlotEdit(storeA, ir)).toEqual({
      mode: "blocked",
      reason: "outs-reference-unanalyzed",
    });
    expect(classifyStoreSlotEdit(storeB, ir)).toEqual({
      mode: "blocked",
      reason: "outs-reference-unanalyzed",
    });
  });

  it("leaves a store NOT referenced by outs() unaffected by the outs() fail-closed rule", () => {
    const store: IRStore = {
      nodeId: "s#plain",
      name: "plainStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const otherStore: IRStore = {
      nodeId: "s#other",
      name: "otherStore",
      items: [{ kind: "char", value: "z" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "any", storeRef: "plainStore" }],
      output: [{ kind: "char", value: "x" }],
    };
    const ruleOuts: IRRule = {
      nodeId: "rule#outs",
      context: [{ kind: "vkey", name: "K_Z", modifiers: [] }],
      output: [{ kind: "outs", storeRef: "otherStore" }],
    };
    const group: IRGroup = {
      nodeId: "g#0",
      name: "main",
      usingKeys: true,
      rules: [rule, ruleOuts],
      readonly: false,
    };
    const ir = makeTestIR([group], [store, otherStore]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "drop", coordinatedWith: [] });
  });

  it("drops a store unreferenced by any rule", () => {
    const store: IRStore = {
      nodeId: "s#orphan",
      name: "orphanStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const ir = makeTestIR([], [store]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "drop", coordinatedWith: [] });
  });

  it("blocks a store that is both an output target (outs()) and an any() source (formerly dual-use — outs() is now blocked outright, Amendment 4)", () => {
    const store: IRStore = {
      nodeId: "s#dual",
      name: "dualStore",
      items: [{ kind: "char", value: "a" }, { kind: "char", value: "b" }],
      isSystem: false,
    };
    const ruleEmit: IRRule = {
      nodeId: "rule#emit",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "outs", storeRef: "dualStore" }],
    };
    const ruleSource: IRRule = {
      nodeId: "rule#source",
      context: [{ kind: "any", storeRef: "dualStore" }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = {
      nodeId: "g#0",
      name: "main",
      usingKeys: true,
      rules: [ruleEmit, ruleSource],
      readonly: false,
    };
    const ir = makeTestIR([group], [store]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({
      mode: "blocked",
      reason: "outs-reference-unanalyzed",
    });
  });
});

// ---------------------------------------------------------------------------
// 7b. describeStorePairing — the single source of truth for "Linked pair"
// style display (studio Inspector), covering the four cases: none, self,
// cross, unresolved.
// ---------------------------------------------------------------------------

describe("describeStorePairing", () => {
  it("'none': an any()-source store never targeted by index() has no pairing relationship", () => {
    const store: IRStore = {
      nodeId: "s#any",
      name: "anyStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "any", storeRef: "anyStore" }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);
    expect(describeStorePairing(store, ir)).toEqual({ kind: "none" });
  });

  it("'none': an orphan store unreferenced by any rule has no pairing relationship", () => {
    const store: IRStore = {
      nodeId: "s#orphan",
      name: "orphanStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const ir = makeTestIR([], [store]);
    expect(describeStorePairing(store, ir)).toEqual({ kind: "none" });
  });

  it("'cross': a dkf/dkt-style CROSS pair names the OTHER store, not itself", () => {
    const ir = makeBaseIr();
    const dkt = ir.stores.find((s) => s.name === "dktX")!;
    const dkf = ir.stores.find((s) => s.name === "dkfX")!;
    expect(describeStorePairing(dkt, ir)).toEqual({ kind: "cross", partners: ["dkfX"] });
    expect(describeStorePairing(dkf, ir)).toEqual({ kind: "cross", partners: ["dktX"] });
  });

  // Canonical failure case (Cameroon):
  //   platform('touch') any(word) any(final) + [K_SPACE] > index(word,2) index(final,3)
  // Two any() context sources, two index() output targets — but each index()
  // resolves back to the SAME store at its own offset, so this produces TWO
  // independent SELF-pairs, never a word<->final cross-pair. The old
  // detectStorePairs heuristic (cross-product every any() against every
  // index() in the rule) wrongly asserted word<->final; this is the
  // regression test for that shape.
  it("'self' x2: a 2-any()/2-index() rule with own-offset resolution produces two independent self-pairs, NOT a cross-pair", () => {
    const word: IRStore = {
      nodeId: "s#word",
      name: "word",
      items: [{ kind: "char", value: "a" }, { kind: "char", value: "b" }],
      isSystem: false,
    };
    const final: IRStore = {
      nodeId: "s#final",
      name: "final",
      items: [{ kind: "char", value: "." }, { kind: "char", value: "!" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [
        { kind: "raw", text: "platform('touch')" },
        { kind: "any", storeRef: "word" },
        { kind: "any", storeRef: "final" },
        { kind: "raw", text: "+" },
        { kind: "vkey", name: "K_SPACE", modifiers: [] },
      ],
      output: [
        { kind: "index", storeRef: "word", offset: 2 },
        { kind: "index", storeRef: "final", offset: 3 },
      ],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [word, final]);
    expect(describeStorePairing(word, ir)).toEqual({ kind: "self" });
    expect(describeStorePairing(final, ir)).toEqual({ kind: "self" });
  });

  it("'unresolved': a store targeted by index() whose pairing can't be resolved to an any() source", () => {
    const store: IRStore = {
      nodeId: "s#unresolved",
      name: "unresolvedStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "index", storeRef: "unresolvedStore", offset: 1 }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);
    expect(describeStorePairing(store, ir)).toEqual({ kind: "unresolved" });
  });

  it("'unresolved': a store referenced via outs() has no nameable partners (Amendment 4 fail-closed)", () => {
    const store: IRStore = {
      nodeId: "s#outs",
      name: "outsStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "outs", storeRef: "outsStore" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);
    expect(describeStorePairing(store, ir)).toEqual({ kind: "unresolved" });
  });

  it("'unresolved' propagates across a cross-pair when a partner is outs()-referenced", () => {
    const storeA: IRStore = {
      nodeId: "s#a",
      name: "storeA",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const storeB: IRStore = {
      nodeId: "s#b",
      name: "storeB",
      items: [{ kind: "char", value: "b" }],
      isSystem: false,
    };
    const rulePair: IRRule = {
      nodeId: "rule#pair",
      context: [{ kind: "any", storeRef: "storeA" }],
      output: [{ kind: "index", storeRef: "storeB", offset: 1 }],
    };
    const ruleOuts: IRRule = {
      nodeId: "rule#outs",
      context: [{ kind: "vkey", name: "K_B", modifiers: [] }],
      output: [{ kind: "outs", storeRef: "storeB" }],
    };
    const group: IRGroup = {
      nodeId: "g#0",
      name: "main",
      usingKeys: true,
      rules: [rulePair, ruleOuts],
      readonly: false,
    };
    const ir = makeTestIR([group], [storeA, storeB]);
    // storeA is only in the graph via the resolved pairing with storeB — its
    // own set is {storeA, storeB} — so it inherits the "unresolved" verdict
    // from storeB's outs() reference.
    expect(describeStorePairing(storeA, ir)).toEqual({ kind: "unresolved" });
    expect(describeStorePairing(storeB, ir)).toEqual({ kind: "unresolved" });
  });
});

// ---------------------------------------------------------------------------
// 8. Other guards
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — other guards", () => {
  it("guard — missing store nodeId: warning, skip, IR unchanged by reference", () => {
    const ir = makeBaseIr();
    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#nonexistent#0"]),
    );

    expect(appliedCount).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/store not found/i);
    expect(result).toBe(ir);
  });

  it("guard — malformed id (no `#` separator): warning, skip", () => {
    const ir = makeBaseIr();
    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store-dkt-0"]),
    );

    expect(appliedCount).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/malformed/i);
    expect(result).toBe(ir);
  });

  it("guard — malformed id (non-numeric index, #abc): warning, skip", () => {
    const ir = makeBaseIr();
    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkt#abc"]),
    );

    expect(appliedCount).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(result).toBe(ir);
  });

  it("guard — out-of-range index warns naming EVERY member of the pair-set", () => {
    const ir = makeBaseIr();
    const { warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkt#999"]),
    );

    expect(appliedCount).toBe(0);
    expect(warnings.some((w) => w.includes("out of range") && w.includes("dktX"))).toBe(true);
    expect(warnings.some((w) => w.includes("out of range") && w.includes("dkfX"))).toBe(true);
  });

  it("guard — end-to-end system-store block: dispatched warning text, appliedCount 0, IR unchanged by reference", () => {
    const store: IRStore = {
      nodeId: "s#sys",
      name: "&NAME",
      items: [{ kind: "char", value: "a" }],
      isSystem: true,
    };
    const ir = makeTestIR([], [store]);

    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["s#sys#0"]),
    );

    expect(appliedCount).toBe(0);
    expect(
      warnings.some(
        (w) =>
          w.includes('store "&NAME"') &&
          w.includes("blocked from editing") &&
          w.includes("it is a system/compiler-directive store."),
      ),
    ).toBe(true);
    expect(result).toBe(ir);
  });

  it("guard — end-to-end context-index-aligned block: dispatched warning text, appliedCount 0, IR unchanged by reference", () => {
    const store: IRStore = {
      nodeId: "s#ctx",
      name: "ctxStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "index", storeRef: "ctxStore", offset: 1 }],
      output: [{ kind: "char", value: "x" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);

    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["s#ctx#0"]),
    );

    expect(appliedCount).toBe(0);
    expect(
      warnings.some(
        (w) =>
          w.includes('store "ctxStore"') &&
          w.includes("blocked from editing") &&
          w.includes(
            "it is referenced by index() in a rule's context; its positions are read by the matcher.",
          ),
      ),
    ).toBe(true);
    expect(result).toBe(ir);
  });

  it("empty slotIds returns baseIr by reference and appliedCount===0", () => {
    const ir = makeBaseIr();
    const { ir: result, appliedCount, warnings } = applyStoreSlotRemovals(ir, new Set());

    expect(result).toBe(ir);
    expect(appliedCount).toBe(0);
    expect(warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9. One call spanning three differently-classed stores at once
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — one call spanning three differently-classed stores", () => {
  it("classifies and applies each independently: coordinated drop, plain drop, and blocked in the same batch", () => {
    // Cross-paired class: output store paired via index() output with an any() input store.
    const outputStore: IRStore = {
      nodeId: "s#output",
      name: "outputStore",
      items: [
        { kind: "char", value: "À" },
        { kind: "char", value: "â" },
      ],
      isSystem: false,
    };
    const inputStore: IRStore = {
      nodeId: "s#input",
      name: "inputStore",
      items: [
        { kind: "char", value: "a" },
        { kind: "char", value: "b" },
      ],
      isSystem: false,
    };
    const parallelRule: IRRule = {
      nodeId: "rule#parallel",
      context: [{ kind: "deadkey", id: 1 }, { kind: "any", storeRef: "inputStore" }],
      output: [{ kind: "index", storeRef: "outputStore", offset: 2 }],
    };

    // Unreferenced store (plain drop class): no rule touches it at all.
    const orphanStore: IRStore = {
      nodeId: "s#orphan",
      name: "orphanStore",
      items: [
        { kind: "char", value: "x" },
        { kind: "char", value: "y" },
      ],
      isSystem: false,
    };

    // notany() store (blocked class): dropping would widen matching.
    const blockedStore: IRStore = {
      nodeId: "s#blocked",
      name: "blockedStore",
      items: [{ kind: "char", value: "q" }, { kind: "char", value: "r" }],
      isSystem: false,
    };
    const notAnyRule: IRRule = {
      nodeId: "rule#notany",
      context: [{ kind: "notany", storeRef: "blockedStore" }],
      output: [{ kind: "char", value: "z" }],
    };

    const group: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      rules: [parallelRule, notAnyRule],
      readonly: false,
    };
    const ir = makeTestIR([group], [outputStore, inputStore, orphanStore, blockedStore]);

    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["s#output#0", "s#orphan#0", "s#blocked#0"]),
    );

    // Combined count: coordinated drop (output + input = 2) + plain drop (1) = 3; blocked contributes 0.
    expect(appliedCount).toBe(3);

    const outputInResult = result.stores.find((s) => s.nodeId === "s#output");
    const inputInResult = result.stores.find((s) => s.nodeId === "s#input");
    expect(outputInResult!.items).toEqual([{ kind: "char", value: "â" }]);
    expect(inputInResult!.items).toEqual([{ kind: "char", value: "b" }]);

    const orphanInResult = result.stores.find((s) => s.nodeId === "s#orphan");
    expect(orphanInResult!.items).toEqual([{ kind: "char", value: "y" }]);

    const blockedInResult = result.stores.find((s) => s.nodeId === "s#blocked");
    // Blocked: untouched, same object reference (structural sharing).
    expect(blockedInResult).toBe(blockedStore);
    expect(
      warnings.some((w) =>
        w.includes('store "blockedStore"') && w.includes("blocked from editing"),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. Canaries — real sibling keyboards checkout (skipped if absent)
// ---------------------------------------------------------------------------

import { classifyRemovalCapabilities } from "../recognizer/classifyRemovalCapabilities.js";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const CAMEROON_KMN = resolve(
  __dir,
  "../../../../../keyboards/release/sil/sil_cameroon_qwerty/source/sil_cameroon_qwerty.kmn",
);
const cameroonExists = existsSync(CAMEROON_KMN);

describe("applyStoreSlotRemovals — Cameroon canary (real keyboard)", () => {
  it.skipIf(!cameroonExists)(
    "parses sil_cameroon_qwerty.kmn and asserts ir.raw.length===0 and dkf003b/dkt003b have equal items.length",
    () => {
      const kmnText = readFileSync(CAMEROON_KMN, "utf-8");
      const { ir } = parse(kmnText, "sil_cameroon_qwerty");

      // No opaque fragments — the carve re-emit gate must be passable
      expect(ir.raw.length).toBe(0);

      const dkf = ir.stores.find((s) => s.name === "dkf003b");
      const dkt = ir.stores.find((s) => s.name === "dkt003b");
      expect(dkf).toBeDefined();
      expect(dkt).toBeDefined();

      // Parallel stores must have equal length for index() alignment to be valid
      expect(dkf!.items.length).toBe(dkt!.items.length);
    },
  );
});

const BAMUM_KMN = resolve(
  __dir,
  "../../../../../keyboards/release/b/bamum/source/bamum.kmn",
);
const bamumExists = existsSync(BAMUM_KMN);

describe("applyStoreSlotRemovals — Bamum canary (bare-any fan-out coordinated drop)", () => {
  it.skipIf(!bamumExists)(
    "removing one defaultU slot coordinates a drop of the paired defaultK input slot too (pairing-graph fix; formerly nul-fill)",
    () => {
      const kmnText = readFileSync(BAMUM_KMN, "utf-8");
      const { ir } = parse(kmnText, "bamum");

      const defaultU = ir.stores.find((s) => s.name === "defaultU");
      const defaultK = ir.stores.find((s) => s.name === "defaultK");
      expect(defaultU).toBeDefined();
      expect(defaultK).toBeDefined();
      const originalULength = defaultU!.items.length;
      const originalKLength = defaultK!.items.length;
      expect(originalULength).toBeGreaterThan(1);

      // Classify — defaultU must still be aliased as removable:slot-fill
      // (a RULE-classification concern, unrelated to the store-slot pairing fix).
      const capMap = classifyRemovalCapabilities(ir);
      expect(capMap.get(defaultU!.nodeId)).toBe("removable:slot-fill");

      // classifyStoreSlotEdit: defaultU is now a coordinated drop, paired with defaultK.
      expect(classifyStoreSlotEdit(defaultU!, ir)).toEqual({
        mode: "drop",
        coordinatedWith: ["defaultK"],
      });

      // Remove slot 0 (first character in the defaultU store).
      const slotId = `${defaultU!.nodeId}#0`;
      const { ir: droppedIr, appliedCount, notices } = applyStoreSlotRemovals(
        ir,
        new Set([slotId]),
      );
      expect(appliedCount).toBe(2); // one item from EACH of the two paired stores
      expect(notices.some((n) => n.includes("coordinated removal"))).toBe(true);

      const droppedU = droppedIr.stores.find((s) => s.name === "defaultU");
      const droppedK = droppedIr.stores.find((s) => s.name === "defaultK");
      expect(droppedU).toBeDefined();
      expect(droppedK).toBeDefined();

      // Both stores shrank by exactly one; slot 0 is gone from BOTH (spliced,
      // not nulled), and what used to be slot 1 is now slot 0.
      expect(droppedU!.items.length).toBe(originalULength - 1);
      expect(droppedK!.items.length).toBe(originalKLength - 1);
      expect(droppedU!.items[0]).toEqual(defaultU!.items[1]);
      expect(droppedK!.items[0]).toEqual(defaultK!.items[1]);

      // No interior nul introduced anywhere.
      const emitted = emit(droppedIr);
      const defaultUEmittedLine = emitted.split("\n").find((l) => l.includes("store(defaultU)"));
      expect(defaultUEmittedLine).toBeDefined();
      expect(defaultUEmittedLine).not.toContain("nul");
    },
  );
});

// ---------------------------------------------------------------------------
// 11. Cameroon-shaped integration test — trimmed embedded fixture
//
// Captures the same idioms as the real sil_cameroon_qwerty.kmn (stores
// word/final/dkf003b/dkt003b; rules :29/:30-shaped self-pairing on
// word/final; the :351-353-shaped dk(003b)/dkf003b/dkt003b cross-pairing;
// literal RALT K_A / SHIFT RALT K_A output rules) WITHOUT committing the
// full SIL keyboard (spec §16 / task instruction).
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — Cameroon-shaped integration (trimmed fixture)", () => {
  const CAMEROON_SHAPED_KMN = [
    "store(&NAME) 'Cameroon-shaped test'",
    "store(&COPYRIGHT) '(C) Test'",
    "store(&TARGETS) 'any'",
    "",
    "begin Unicode > use(main)",
    "",
    "group(main) using keys",
    "",
    "store(word) \"aɛbcĐƐz\"",
    "store(final) \".!?\"",
    "store(dkf003b) U+0061 U+0062 U+0063 U+0064 U+0065 U+0066 U+0067 U+0068 U+0069 U+006A U+006B U+006C",
    "store(dkt003b) U+003B U+2019 U+201D U+00BC U+00BD U+00BE U+20AC U+00D7 U+2018 U+201C U+025B U+0190 nul nul",
    "",
    "platform('touch') any(word) any(final) + [K_SPACE] > index(word,2) index(final,3) \" \"",
    "dk(003b) any(dkf003b) > index(dkt003b, 2)",
    "",
    "+ [RALT K_A] > U+025B",
    "+ [SHIFT RALT K_A] > U+0190",
  ].join("\n");

  it("parses codec-clean (no opaque fragments) and index-target length >= any-source length holds", () => {
    const { ir, warnings } = parse(CAMEROON_SHAPED_KMN, "cameroon_shaped");
    expect(warnings ?? []).toHaveLength(0);
    expect(ir.raw.length).toBe(0);

    const dkf = ir.stores.find((s) => s.name === "dkf003b")!;
    const dkt = ir.stores.find((s) => s.name === "dkt003b")!;
    expect(dkt.items.length).toBeGreaterThanOrEqual(dkf.items.length);
  });

  it("carving the ɛ+Ɛ contributor set splices word/final self-paired and dkf003b/dkt003b cross-paired at the SAME positions, with no interior nul", () => {
    const { ir: baseIr } = parse(CAMEROON_SHAPED_KMN, "cameroon_shaped");

    const lower = collectCharContributors(baseIr, "ɛ");
    const upper = collectCharContributors(baseIr, "Ɛ");

    // Whole-rule deletes for the two literal RALT rules.
    expect(lower.ruleNodeIds.length).toBe(1);
    expect(upper.ruleNodeIds.length).toBe(1);

    // Store-slot contributors: word (self-paired) and dkt003b (cross-paired).
    const deletedItemIds = new Set<string>([
      ...lower.ruleNodeIds,
      ...lower.storeSlotIds,
      ...upper.ruleNodeIds,
      ...upper.storeSlotIds,
    ]);

    const storeNodeIdSet = new Set(baseIr.stores.map((s) => s.nodeId));
    const slotIds = new Set<string>();
    const wholeNodeItemIds = new Set<string>();
    for (const id of deletedItemIds) {
      const parsed = parseSlotId(id);
      if (parsed !== null && storeNodeIdSet.has(parsed.storeNodeId)) {
        slotIds.add(id);
      } else {
        wholeNodeItemIds.add(id);
      }
    }

    // Non-vacuous: both a whole-rule and a slot-level contributor were found.
    expect(wholeNodeItemIds.size).toBe(2);
    expect(slotIds.size).toBeGreaterThan(0);

    const { ir: carvedIr, notices, appliedCount } = applyStoreSlotRemovals(baseIr, slotIds);
    expect(appliedCount).toBeGreaterThan(0);
    expect(notices.some((n) => n.includes("coordinated removal") && n.includes("dkf003b") && n.includes("dkt003b"))).toBe(true);

    const word = carvedIr.stores.find((s) => s.name === "word")!;
    const final = carvedIr.stores.find((s) => s.name === "final")!;
    const dkf = carvedIr.stores.find((s) => s.name === "dkf003b")!;
    const dkt = carvedIr.stores.find((s) => s.name === "dkt003b")!;

    // word lost ɛ and Ɛ (self-paired drop); final is untouched (no ɛ/Ɛ in it).
    expect(word.items.map((i) => (i.kind === "char" ? i.value : i.kind))).toEqual(["a", "b", "c", "Đ", "z"]);
    const baseFinal = baseIr.stores.find((s) => s.name === "final")!;
    expect(final).toBe(baseFinal); // structural sharing: untouched store keeps the same reference

    // dkf003b and dkt003b both lost items[10] and items[11] (ɛ, Ɛ) — SAME
    // positions in both, per the pairing graph. Neither store shrinks to a
    // different length than the other.
    expect(dkf.items.length).toBe(10);
    expect(dkt.items.length).toBe(12); // started 2 longer (trailing nuls) — stays 2 longer
    // dkt003b's original trailing nuls (positions 12,13) are now positions 10,11 — present, not interior.
    expect(dkt.items[10]).toEqual({ kind: "raw", text: "nul" });
    expect(dkt.items[11]).toEqual({ kind: "raw", text: "nul" });
    // No char item anywhere in dkt003b sits AFTER a nul — i.e. every nul is trailing.
    const firstNulIdx = dkt.items.findIndex((i) => i.kind === "raw" && i.text === "nul");
    expect(dkt.items.slice(firstNulIdx).every((i) => i.kind === "raw" && i.text === "nul")).toBe(true);

    // Emitted text contains no MORE nuls than the two pre-existing ones, and
    // no interior nul (Layer-A check #9's alignment invariant holds).
    const emitted = emit(carvedIr);
    const dktLine = emitted.split("\n").find((l) => l.includes("store(dkt003b)"));
    expect(dktLine).toBeDefined();
    expect((dktLine!.match(/nul/g) ?? []).length).toBe(2);
  });
});
