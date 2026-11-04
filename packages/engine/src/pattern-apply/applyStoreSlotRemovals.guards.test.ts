import { describe, it, expect } from "vitest";
import { applyStoreSlotRemovals, classifyStoreSlotEdit, analyzeStores, storeRoleOf } from "./applyStoreSlotRemovals.js";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR, IRStore, IRGroup, IRRule } from "@keyboard-studio/contracts";
import { makeOutputStore, makeInputStore, makeParallelStoreGroup, makeStartIr, makeSelfPairedIr } from "../test-support/applyStoreSlotRemovals.testkit.js";

// ---------------------------------------------------------------------------
// 8. Other guards
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — other guards", () => {
  it("guard — missing store nodeId: warning, skip, IR unchanged by reference", () => {
    const ir = makeStartIr();
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
    const ir = makeStartIr();
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
    const ir = makeStartIr();
    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkt#abc"]),
    );

    expect(appliedCount).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(result).toBe(ir);
  });

  it("guard — out-of-range index warns naming EVERY member of the pair-set", () => {
    const ir = makeStartIr();
    const { warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkt#999"]),
    );

    expect(appliedCount).toBe(0);
    expect(warnings.some((w) => w.includes("out of range") && w.includes("dktX"))).toBe(true);
    expect(warnings.some((w) => w.includes("out of range") && w.includes("dkfX"))).toBe(true);
  });

  // #931 review — a target position can be valid for ONE pair-set member but
  // out of range for ANOTHER when the two stores have unequal item-array
  // lengths. The existing "out of range" fixture above (makeStartIr) gives
  // dktX and dkfX equal length (4 each), so an out-of-range index (999) is
  // out of range for BOTH — this only exercises the guard's "invalid for
  // both" path. This fixture makes dktX2 longer (4 items) than dkfX2
  // (2 items) so position 3 is IN-RANGE for dktX2 but OUT OF RANGE for
  // dkfX2, proving the per-member range check (not a whole-pair-set length
  // equality check) is what refuses the position.
  it("guard — out-of-range index for ONE pair-set member, in-range for another (unequal-length members)", () => {
    const outputStore = makeOutputStore("store#dkt2", "dktX2", [
      { kind: "char", value: "À" },
      { kind: "char", value: "ε" },
      { kind: "raw", text: "nul" },
      { kind: "char", value: "z" }, // index 3 — in range for dktX2 (length 4)
    ]);
    const inputStore = makeInputStore("store#dkf2", "dkfX2", ["a", "b"]); // length 2 — index 3 out of range
    const group = makeParallelStoreGroup("group#unequal", "rule#unequal", 0x003c, "dkfX2", "dktX2");
    const ir = makeTestIR([group], [outputStore, inputStore]);

    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkt2#3"]),
    );

    // The pair-set is coordinated, so the position is refused for BOTH
    // members even though it was in-range for dktX2 alone — the guard warns
    // about the member it's actually invalid for (dkfX2 gets its own "out of
    // range for store" clause), and nothing is applied. dktX2's name still
    // appears in the SAME warning's trailing "coordinated slot skipped for
    // paired stores ..." member list, so assert the exact per-store clause
    // rather than a bare substring match on the name.
    expect(appliedCount).toBe(0);
    expect(warnings.some((w) => w.includes(`out of range for store "dkfX2"`))).toBe(true);
    expect(warnings.some((w) => w.includes(`out of range for store "dktX2"`))).toBe(false);
    expect(result).toBe(ir); // unchanged by reference — no partial application
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
    const ir = makeStartIr();
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
// 12. Store ROLE — asIndexOutputTarget / storeRoleOf (spec 051 T009)
//
// Additive coverage for the fourth usage flag. The collateral guard turns on
// "is this partner store an OUTPUT target?" — a fact nothing in the analysis
// could answer before, because pairSets membership is symmetric.
// ---------------------------------------------------------------------------

describe("analyzeStores — store role (spec 051)", () => {
  /** Cameroon's grave-accent pair: dkf0060 any()-consumed, dkt0060 index()-targeted. */
  function makeGraveAccentIr(): KeyboardIR {
    const dkf = makeInputStore("store#dkf0060", "dkf0060", ["a", "i", "u"]);
    const dkt = makeOutputStore("store#dkt0060", "dkt0060", [
      { kind: "char", value: "à" },
      { kind: "char", value: "ɨ" },
      { kind: "char", value: "ù" },
    ]);
    const group = makeParallelStoreGroup("group#main", "rule#0", 0x0060, "dkf0060", "dkt0060");
    return makeTestIR([group], [dkt, dkf]);
  }

  it("marks the any()-consumed input store as NOT an output target (dkf0060 -> input)", () => {
    const analysis = analyzeStores(makeGraveAccentIr());
    expect(analysis.usageByName.get("dkf0060")?.asAnySource).toBe(true);
    expect(analysis.usageByName.get("dkf0060")?.asIndexOutputTarget).toBe(false);
    expect(storeRoleOf(analysis, "dkf0060")).toBe("input");
  });

  it("marks the index()-targeted output store as an output target (dkt0060 -> output)", () => {
    const analysis = analyzeStores(makeGraveAccentIr());
    expect(analysis.usageByName.get("dkt0060")?.asAnySource).toBe(false);
    expect(analysis.usageByName.get("dkt0060")?.asIndexOutputTarget).toBe(true);
    expect(storeRoleOf(analysis, "dkt0060")).toBe("output");
  });

  it("classifies a self-paired store as BOTH, and it still has an empty coordinatedWith", () => {
    const ir = makeSelfPairedIr();
    const analysis = analyzeStores(ir);
    expect(storeRoleOf(analysis, "word")).toBe("both");
    // Unchanged from today: a self-paired store never reaches the guard, because
    // there is no other store to coordinate with (spec 051 invariant D5).
    const store = ir.stores.find((s) => s.name === "word")!;
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "drop", coordinatedWith: [] });
  });

  it("reports a store no rule references as unused", () => {
    const orphan = makeInputStore("store#orphan", "orphanX", ["q"]);
    const ir = makeTestIR([makeParallelStoreGroup("group#main", "rule#0", 0x0060, "dkfX", "dktX")], [
      makeInputStore("store#dkf", "dkfX", ["a"]),
      makeOutputStore("store#dkt", "dktX", [{ kind: "char", value: "à" }]),
      orphan,
    ]);
    expect(storeRoleOf(analyzeStores(ir), "orphanX")).toBe("unused");
  });

  it("marks an outs()-referenced store as an output target", () => {
    const src = makeOutputStore("store#src", "srcX", [{ kind: "char", value: "x" }]);
    const rule: IRRule = {
      nodeId: "rule#outs",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "outs", storeRef: "srcX" }],
    };
    const ir = makeTestIR([{ nodeId: "group#main", name: "main", usingKeys: true, rules: [rule], readonly: false }], [src]);
    expect(storeRoleOf(analyzeStores(ir), "srcX")).toBe("output");
  });

  it("a rule containing a namedDeadkey element is invisible to the analysis (#2238 pin D7)", () => {
    // Fragment-era posture preserved: a named fan-out contributed nothing
    // to analyzeStores when it was an opaque fragment, so its stores read
    // as plain unreferenced stores (simple drops) — typed named fan-outs
    // must not silently gain coordinated pair-drop or blocked posture.
    const inStore = makeInputStore("store#namedIn", "namedIn", ["a", "e"]);
    const outStore = makeOutputStore("store#namedOut", "namedOut", [
      { kind: "char", value: "á" },
      { kind: "char", value: "é" },
    ]);
    const rule: IRRule = {
      nodeId: "rule#named-fanout",
      context: [
        { kind: "namedDeadkey", name: "acute" },
        { kind: "raw", text: "+" },
        { kind: "any", storeRef: "namedIn" },
      ],
      output: [{ kind: "index", storeRef: "namedOut", offset: 2 }],
    };
    const group: IRGroup = { nodeId: "group#main", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [inStore, outStore]);
    const analysis = analyzeStores(ir);
    expect(storeRoleOf(analysis, "namedIn")).toBe("unused");
    expect(storeRoleOf(analysis, "namedOut")).toBe("unused");
    expect(classifyStoreSlotEdit(outStore, ir)).toEqual({ mode: "drop", coordinatedWith: [] });
  });
});
