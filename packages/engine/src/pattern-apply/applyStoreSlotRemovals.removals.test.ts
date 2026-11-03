import { describe, it, expect } from "vitest";
import { applyStoreSlotRemovals, classifyStoreSlotEdit } from "./applyStoreSlotRemovals.js";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR, IRStore, IRGroup, IRRule } from "@keyboard-studio/contracts";
import { makeOutputStore, makeInputStore, makeParallelStoreGroup, makeStartIr, makeSelfPairedIr, NUL } from "../test-support/applyStoreSlotRemovals.testkit.js";

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
    const ir = makeStartIr();
    const store = ir.stores.find((s) => s.nodeId === "store#dkt")!;
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "drop", coordinatedWith: ["dkfX"] });
  });

  it("classifies the input store (formerly blocked as paired-input/dual-use) as drop, coordinated with the output store — the Matt-directive fix", () => {
    const ir = makeStartIr();
    const store = ir.stores.find((s) => s.nodeId === "store#dkf")!;
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "drop", coordinatedWith: ["dktX"] });
  });

  it("dropping a slot from the OUTPUT store also splices the SAME position out of the paired INPUT store", () => {
    const ir = makeStartIr();
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
    const ir = makeStartIr();
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
    const ir = makeStartIr();
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
    const ir = makeStartIr();
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
    const ir = makeStartIr();
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
    const ir = makeStartIr();
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
// 4. Emptying an any()-consumed store removes it and the rules that reference it
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — emptied any() store is removed with its rules", () => {
  it("emptying a single any()-referenced store removes the store and its rule, with a notice and no refusal warning", () => {
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

    const { ir: result, warnings, notices, appliedCount, removedRules, removedStores } =
      applyStoreSlotRemovals(ir, new Set(["s#last#0"]));

    expect(appliedCount).toBe(1);
    expect(result.stores.find((s) => s.nodeId === "s#last")).toBeUndefined();
    expect(result.groups[0]?.rules).toEqual([]);
    expect(removedRules).toEqual([{ groupNodeId: "g#0", ruleNodeId: "rule#0" }]);
    expect(removedStores).toEqual(["lastStore"]);
    expect(warnings.some((w) => w.includes("refusing"))).toBe(false);
    expect(notices.some((n) => n.includes("lastStore") && n.includes("rule#0"))).toBe(true);
    // startIr is never mutated.
    expect(ir.groups[0]?.rules).toHaveLength(1);
    expect(ir.stores).toHaveLength(1);
  });

  it("a COORDINATED drop that empties a cross-paired pair-set removes both stores and the rule", () => {
    const outStore = makeOutputStore("store#dkt", "dktX", [{ kind: "char", value: "z" }]);
    const inStore = makeInputStore("store#dkf", "dkfX", ["a"]);
    const group = makeParallelStoreGroup("group#main", "rule#0", 0x003b, "dkfX", "dktX");
    const ir = makeTestIR([group], [outStore, inStore]);

    const { ir: result, warnings, removedStores } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkt#0"]),
    );

    expect(result.stores).toEqual([]);
    expect(result.groups[0]?.rules).toEqual([]);
    expect(removedStores).toEqual(["dkfX", "dktX"]);
    expect(warnings.some((w) => w.includes("refusing"))).toBe(false);
  });

  it("a partner padded with trailing nul is removed too when the any() input store empties", () => {
    const inStore = makeInputStore("store#dkf", "dkfX", ["a", "b"]);
    const outStore = makeOutputStore("store#dkt", "dktX", [
      { kind: "char", value: "A" },
      { kind: "char", value: "B" },
      { kind: "raw", text: "nul" },
    ]);
    const group = makeParallelStoreGroup("group#main", "rule#0", 0x003b, "dkfX", "dktX");
    const ir = makeTestIR([group], [inStore, outStore]);

    const { ir: result, removedStores } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkf#0", "store#dkf#1"]),
    );

    expect(result.stores).toEqual([]);
    expect(result.groups[0]?.rules).toEqual([]);
    expect(removedStores).toEqual(["dkfX", "dktX"]);
  });

  it("a rule that references the emptied store alongside other context is removed too", () => {
    const store = makeInputStore("store#ka", "ka", ["a"]);
    const other = makeInputStore("store#kc", "kc", ["q", "r"]);
    const rule: IRRule = {
      nodeId: "rule#multi",
      context: [
        { kind: "any", storeRef: "kc" },
        { kind: "raw", text: "+" },
        { kind: "any", storeRef: "ka" },
      ],
      output: [{ kind: "char", value: "z" }],
    };
    const keep: IRRule = {
      nodeId: "rule#keep",
      context: [{ kind: "any", storeRef: "kc" }],
      output: [{ kind: "char", value: "y" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule, keep], readonly: false };
    const ir = makeTestIR([group], [store, other]);

    const { ir: result } = applyStoreSlotRemovals(ir, new Set(["store#ka#0"]));

    expect(result.groups[0]?.rules.map((r) => r.nodeId)).toEqual(["rule#keep"]);
    expect(result.stores.map((s) => s.name)).toEqual(["kc"]);
  });

  it("emptying an UNREFERENCED store drops it: no empty store is emitted, no refusal warning", () => {
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
    expect(result.stores).toEqual([]);
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
