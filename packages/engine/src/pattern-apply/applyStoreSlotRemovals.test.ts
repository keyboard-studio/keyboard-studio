// Tests for applyStoreSlotRemovals — per-store-class store-slot edit dispatch
// (nul-fill, drop, blocked) for carving individual characters out of a store.
//
// Coverage (12 legacy nul-fill blocks, retained + updated, plus new classifier
// and drop-dispatch blocks):
//   1.  Single char slot replaced → items[i] === nul; others unchanged; appliedCount===1.
//   2.  Multiple indices on one store → all replaced; items.length unchanged.
//   3.  Slots across two distinct output stores → both rewritten; untouched store ref unchanged.
//   4.  baseIr not mutated.
//   5.  Items-vs-display index: target char after a non-char item.
//   6.  Guard — paired-input store (any() source paired with an output index()) → blocked.
//   7.  Guard — missing store nodeId → warning, skip.
//   8.  Out-of-range index alongside a valid index → warning for range, valid one applies.
//   9.  Malformed id (no `#`, or `#abc`) → warning, skip.
//   10. Existing nul slot stays unchanged when a different char slot is removed.
//   11. Empty slotIds → returns baseIr by reference, appliedCount===0.
//   12. Round-trip: emit nul-filled IR, re-parse, assert nul slot is `nul` at same index.
//   13. classifyStoreSlotEdit unit cases — one per class in the decision table.
//   14. Drop dispatch — any-only unpaired store, unreferenced store.
//   15. Drop dispatch — true items[] index targeting with mixed vkey/char items;
//       skipping a non-char index warns without dropping it.
//   16. Drop dispatch — structural sharing (untouched stores keep the same reference).
//   17. Drop dispatch — multiple drops in one store in one pass (descending-index safety).
//   18. Drop dispatch — dropping the last item emits the empty-store warning.

import { describe, it, expect } from "vitest";
import {
  applyStoreSlotRemovals,
  classifyStoreSlotEdit,
} from "./applyStoreSlotRemovals.js";
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
 * Minimal parallel-store IR with one output store dktX, one input store dkfX,
 * and a rule: dk(0x003b) any(dkfX) > index(dktX, 2).
 *
 * Output store items: ['À', 'ε' (U+03B5 Greek — fixture placeholder; Cameroon IPA open-e is U+025B), raw(nul), raw(nul)]
 *   (mix a non-char before/after a char to prove items-index vs display-index)
 */
function makeBaseIr(
  outputStoreNodeId = "store#dkt",
  inputStoreNodeId = "store#dkf",
): KeyboardIR {
  const outputItems: StoreItem[] = [
    { kind: "char", value: "À" },  // index 0
    { kind: "char", value: "ε" },  // index 1
    { kind: "raw", text: "nul" },   // index 2  (non-char)
    { kind: "raw", text: "nul" },   // index 3  (non-char)
  ];
  const outputStore = makeOutputStore(outputStoreNodeId, "dktX", outputItems);
  const inputStore = makeInputStore(inputStoreNodeId, "dkfX", ["a", "b", "c", "d"]);
  const group = makeParallelStoreGroup("group#main", "rule#0", 0x003b, "dkfX", "dktX");
  return makeTestIR([group], [outputStore, inputStore]);
}

const NUL: StoreItem = { kind: "raw", text: "nul" };

// ---------------------------------------------------------------------------
// 1. Single char slot replaced
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — single slot replacement", () => {
  it("replaces the targeted char slot with nul; all others unchanged; appliedCount===1", () => {
    const ir = makeBaseIr();
    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkt#0"]),
    );

    expect(appliedCount).toBe(1);
    expect(warnings).toHaveLength(0);

    const store = result.stores.find((s) => s.nodeId === "store#dkt");
    expect(store).toBeDefined();
    expect(store!.items[0]).toEqual(NUL);
    // items[1] (ε) unchanged
    expect(store!.items[1]).toEqual({ kind: "char", value: "ε" });
    // items[2,3] (nul) unchanged
    expect(store!.items[2]).toEqual({ kind: "raw", text: "nul" });
    expect(store!.items[3]).toEqual({ kind: "raw", text: "nul" });
    // items.length unchanged
    expect(store!.items.length).toBe(4);
    // input store unchanged
    const inputStore = result.stores.find((s) => s.nodeId === "store#dkf");
    expect(inputStore!.items[0]).toEqual({ kind: "char", value: "a" });
  });
});

// ---------------------------------------------------------------------------
// 2. Multiple indices on one store in one call
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — multiple indices on one store", () => {
  it("replaces both targeted indices; items.length unchanged", () => {
    const ir = makeBaseIr();
    const { ir: result, appliedCount, warnings } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkt#0", "store#dkt#1"]),
    );

    expect(appliedCount).toBe(2);
    expect(warnings).toHaveLength(0);

    const store = result.stores.find((s) => s.nodeId === "store#dkt");
    expect(store!.items[0]).toEqual(NUL);
    expect(store!.items[1]).toEqual(NUL);
    expect(store!.items.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 3. Slots across two distinct output stores
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — slots across two distinct output stores", () => {
  it("rewrites both output stores; untouched store retains same object reference", () => {
    // Build an IR with two output stores each referenced by a different rule
    const outputStore1: IRStore = {
      nodeId: "store#dkt1",
      name: "dkt1",
      items: [
        { kind: "char", value: "À" },
        { kind: "char", value: "ε" },
      ],
      isSystem: false,
    };
    const outputStore2: IRStore = {
      nodeId: "store#dkt2",
      name: "dkt2",
      items: [
        { kind: "char", value: "â" },
        { kind: "char", value: "ô" },
      ],
      isSystem: false,
    };
    const inputStore: IRStore = {
      nodeId: "store#dkf1",
      name: "dkf1",
      items: [
        { kind: "char", value: "a" },
        { kind: "char", value: "b" },
      ],
      isSystem: false,
    };
    const rule1: IRRule = {
      nodeId: "rule#1",
      context: [{ kind: "deadkey", id: 1 }, { kind: "any", storeRef: "dkf1" }],
      output: [{ kind: "index", storeRef: "dkt1", offset: 2 }],
    };
    const rule2: IRRule = {
      nodeId: "rule#2",
      context: [{ kind: "deadkey", id: 2 }, { kind: "any", storeRef: "dkf1" }],
      output: [{ kind: "index", storeRef: "dkt2", offset: 2 }],
    };
    const group: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      rules: [rule1, rule2],
      readonly: false,
    };
    const ir = makeTestIR([group], [outputStore1, outputStore2, inputStore]);

    const { ir: result, appliedCount, warnings } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkt1#0", "store#dkt2#1"]),
    );

    expect(appliedCount).toBe(2);
    expect(warnings).toHaveLength(0);

    const s1 = result.stores.find((s) => s.nodeId === "store#dkt1");
    const s2 = result.stores.find((s) => s.nodeId === "store#dkt2");
    expect(s1!.items[0]).toEqual(NUL);
    expect(s1!.items[1]).toEqual({ kind: "char", value: "ε" });
    expect(s2!.items[0]).toEqual({ kind: "char", value: "â" });
    expect(s2!.items[1]).toEqual(NUL);

    // input store is untouched — same object reference
    const inputInResult = result.stores.find((s) => s.nodeId === "store#dkf1");
    expect(inputInResult).toBe(inputStore);
  });
});

// ---------------------------------------------------------------------------
// 4. baseIr not mutated
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — baseIr not mutated", () => {
  it("deep clone before call equals deep clone after call", () => {
    const ir = makeBaseIr();
    const before = structuredClone(ir);

    applyStoreSlotRemovals(ir, new Set(["store#dkt#0", "store#dkt#1"]));

    expect(ir).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// 5. Items-vs-display index: target char that sits AFTER a non-char item
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — items-vs-display index", () => {
  it("correctly replaces items[1] (ε, after a nul at items[0])", () => {
    // Build a store where items[0]=nul, items[1]=ε
    const outputStore: IRStore = {
      nodeId: "store#dkt",
      name: "dktX",
      items: [
        { kind: "raw", text: "nul" },  // index 0 — non-char
        { kind: "char", value: "ε" },  // index 1 — char
        { kind: "char", value: "â" },  // index 2 — char
      ],
      isSystem: false,
    };
    const inputStore = makeInputStore("store#dkf", "dkfX", ["a", "b", "c"]);
    const group = makeParallelStoreGroup("group#main", "rule#0", 0x003b, "dkfX", "dktX");
    const ir = makeTestIR([group], [outputStore, inputStore]);

    const { ir: result, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkt#1"]),
    );

    expect(appliedCount).toBe(1);
    const store = result.stores.find((s) => s.nodeId === "store#dkt");
    // items[0] (nul) untouched
    expect(store!.items[0]).toEqual({ kind: "raw", text: "nul" });
    // items[1] (ε) replaced with nul — this is the items-index, not display-index (which would be 0)
    expect(store!.items[1]).toEqual(NUL);
    // items[2] (â) untouched
    expect(store!.items[2]).toEqual({ kind: "char", value: "â" });
  });
});

// ---------------------------------------------------------------------------
// 6. Guard — input-only store
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — input-only store guard (paired-input)", () => {
  it("emits a paired-input blocked warning, appliedCount===0, and returns baseIr by reference", () => {
    const ir = makeBaseIr();
    // "store#dkf" is an any() source in the same rule whose output carries an
    // index() element (paired with dktX) — positional coupling makes drop unsafe.
    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkf#0"]),
    );

    expect(appliedCount).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/blocked from editing.*any\(\).*index\(\)|paired.*alignment/i);
    // Returns the same reference when nothing was applied
    expect(result).toBe(ir);
  });
});

// ---------------------------------------------------------------------------
// 7. Guard — missing store nodeId
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — missing store nodeId guard", () => {
  it("emits warning for unknown nodeId; skips that slot", () => {
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
});

// ---------------------------------------------------------------------------
// 8. Out-of-range index alongside a valid index
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — out-of-range index alongside valid index", () => {
  it("warns for out-of-range slot; valid slot is still applied", () => {
    const ir = makeBaseIr();
    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkt#999", "store#dkt#0"]),
    );

    // Only the valid one applied
    expect(appliedCount).toBe(1);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes("out of range") || w.includes("999"))).toBe(true);

    const store = result.stores.find((s) => s.nodeId === "store#dkt");
    expect(store!.items[0]).toEqual(NUL);    // valid slot applied
    expect(store!.items[1]).toEqual({ kind: "char", value: "ε" }); // unchanged
  });
});

// ---------------------------------------------------------------------------
// 9. Malformed id (no `#`, or `#abc`)
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — malformed slot id", () => {
  it("warns and skips a slot id with no # separator", () => {
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

  it("warns and skips a slot id with non-numeric index (#abc)", () => {
    const ir = makeBaseIr();
    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["store#dkt#abc"]),
    );

    expect(appliedCount).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(result).toBe(ir);
  });
});

// ---------------------------------------------------------------------------
// 10. Existing nul slot stays nul when a different char slot is removed
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — existing nul stays nul", () => {
  it("does not alter items[2] (nul) when only items[0] is targeted", () => {
    const ir = makeBaseIr();
    const { ir: result } = applyStoreSlotRemovals(ir, new Set(["store#dkt#0"]));

    const store = result.stores.find((s) => s.nodeId === "store#dkt");
    expect(store!.items[2]).toEqual({ kind: "raw", text: "nul" });
    expect(store!.items[3]).toEqual({ kind: "raw", text: "nul" });
  });
});

// ---------------------------------------------------------------------------
// 11. Empty slotIds
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — empty slotIds", () => {
  it("returns baseIr by reference and appliedCount===0", () => {
    const ir = makeBaseIr();
    const { ir: result, appliedCount, warnings } = applyStoreSlotRemovals(ir, new Set());

    expect(result).toBe(ir);
    expect(appliedCount).toBe(0);
    expect(warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 12. Round-trip: emit nul-filled IR, re-parse, assert nul slot is `nul`
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — round-trip emit/re-parse", () => {
  it("emitting and re-parsing the nul-filled IR yields nul at the same items index", () => {
    // Minimal .kmn text with an output store that has char items
    // so we can parse a real IR and test the round-trip
    const kmnText = [
      "c Round-trip test for nul insertion",
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

    // Find the dktRt output store
    const dktStore = parsedIr.stores.find((s) => s.name === "dktRt");
    expect(dktStore).toBeDefined();
    expect(dktStore!.items.length).toBe(3);

    // Replace items[1] (â, U+00E2) with nul
    const { ir: nulledIr, appliedCount } = applyStoreSlotRemovals(
      parsedIr,
      new Set([`${dktStore!.nodeId}#1`]),
    );
    expect(appliedCount).toBe(1);

    // Emit the nul-filled IR
    const emitted = emit(nulledIr);
    expect(emitted).toContain("nul");

    // Re-parse
    const { ir: reparsed } = parse(emitted, "rt_test");
    const reparsedDkt = reparsed.stores.find((s) => s.name === "dktRt");
    expect(reparsedDkt).toBeDefined();

    // items.length must be unchanged
    expect(reparsedDkt!.items.length).toBe(3);

    // items[1] must be nul (emitted as the `nul` raw token which re-parses as nul)
    // The codec parses `nul` as { kind: "raw", text: "nul" } in store context
    const nullItem = reparsedDkt!.items[1];
    expect(nullItem).toBeDefined();
    expect(nullItem).toEqual({ kind: "raw", text: "nul" });

    // items[0] (à, U+00E0) still present
    expect(reparsedDkt!.items[0]).toEqual({ kind: "char", value: "à" });
    // items[2] (è, U+00E8) still present
    expect(reparsedDkt!.items[2]).toEqual({ kind: "char", value: "è" });
  });
});

// ---------------------------------------------------------------------------
// Cameroon canary — real keyboard from sibling ../keyboards checkout
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

// ---------------------------------------------------------------------------
// Bamum canary — bare-any fan-out round-trip
// ---------------------------------------------------------------------------

const BAMUM_KMN = resolve(
  __dir,
  "../../../../../keyboards/release/b/bamum/source/bamum.kmn",
);
const bamumExists = existsSync(BAMUM_KMN);

describe("applyStoreSlotRemovals — Bamum canary (bare-any fan-out round-trip)", () => {
  it.skipIf(!bamumExists)(
    "removing one defaultU slot nul-fills that position, preserves all other slots, round-trips",
    () => {
      const kmnText = readFileSync(BAMUM_KMN, "utf-8");
      const { ir } = parse(kmnText, "bamum");

      // Locate the defaultU output store.
      const defaultU = ir.stores.find((s) => s.name === "defaultU");
      expect(defaultU).toBeDefined();
      const originalLength = defaultU!.items.length;
      expect(originalLength).toBeGreaterThan(1);

      // Classify — defaultU must be aliased as removable:slot-fill.
      const capMap = classifyRemovalCapabilities(ir);
      expect(capMap.get(defaultU!.nodeId)).toBe("removable:slot-fill");

      // Remove slot 0 (first character in the defaultU store).
      const slotId = `${defaultU!.nodeId}#0`;
      const { ir: nulledIr, appliedCount, warnings } = applyStoreSlotRemovals(
        ir,
        new Set([slotId]),
      );
      expect(warnings).toHaveLength(0);
      expect(appliedCount).toBe(1);

      // Slot 0 replaced with nul; all others preserved.
      const nulledStore = nulledIr.stores.find((s) => s.name === "defaultU");
      expect(nulledStore).toBeDefined();
      expect(nulledStore!.items[0]).toEqual({ kind: "raw", text: "nul" });
      expect(nulledStore!.items.length).toBe(originalLength);
      // Slot 1 must be the original second item (unchanged).
      expect(nulledStore!.items[1]).toEqual(defaultU!.items[1]);

      // Emit and re-parse (round-trip).
      const emitted = emit(nulledIr);
      const { ir: reparsed } = parse(emitted, "bamum");
      const reparsedStore = reparsed.stores.find((s) => s.name === "defaultU");
      expect(reparsedStore).toBeDefined();
      expect(reparsedStore!.items.length).toBe(originalLength);
      expect(reparsedStore!.items[0]).toEqual({ kind: "raw", text: "nul" });
    },
  );
});

// ---------------------------------------------------------------------------
// 13. classifyStoreSlotEdit — one unit case per class in the decision table
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

  it("blocks a dual-use store (output target AND any() source, no pairing)", () => {
    const store: IRStore = {
      nodeId: "s#dual",
      name: "dualStore",
      items: [{ kind: "char", value: "a" }, { kind: "char", value: "b" }],
      isSystem: false,
    };
    // Rule A emits dualStore via outs() in one rule (no any() here).
    const ruleEmit: IRRule = {
      nodeId: "rule#emit",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "outs", storeRef: "dualStore" }],
    };
    // Rule B uses dualStore as an any() source, output has no index() (unpaired).
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
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "blocked", reason: "dual-use" });
  });

  it("nul-fills a store referenced only as an output target (index()/outs())", () => {
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
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "nul-fill" });
  });

  it("blocks a paired-input store (any() source in a rule whose output has index())", () => {
    const store: IRStore = {
      nodeId: "s#paired",
      name: "pairedStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const otherStore: IRStore = {
      nodeId: "s#other",
      name: "otherStore",
      items: [{ kind: "char", value: "x" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "any", storeRef: "pairedStore" }],
      output: [{ kind: "index", storeRef: "otherStore", offset: 1 }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store, otherStore]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "blocked", reason: "paired-input" });
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
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "drop" });
  });

  it("drops a store unreferenced by any rule", () => {
    const store: IRStore = {
      nodeId: "s#orphan",
      name: "orphanStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const ir = makeTestIR([], [store]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "drop" });
  });
});

// ---------------------------------------------------------------------------
// 14–18. Drop dispatch through applyStoreSlotRemovals
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — drop dispatch", () => {
  it("drops a slot from an any-only unpaired store; items.length shrinks by one", () => {
    const store: IRStore = {
      nodeId: "s#any",
      name: "anyStore",
      items: [
        { kind: "char", value: "a" },
        { kind: "char", value: "b" },
        { kind: "char", value: "c" },
      ],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "any", storeRef: "anyStore" }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);

    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["s#any#1"]),
    );

    expect(warnings).toHaveLength(0);
    expect(appliedCount).toBe(1);
    const resultStore = result.stores.find((s) => s.nodeId === "s#any");
    expect(resultStore!.items).toEqual([
      { kind: "char", value: "a" },
      { kind: "char", value: "c" },
    ]);
    expect(resultStore!.items.length).toBe(2);
  });

  it("drops a slot from an unreferenced (orphan) store", () => {
    const store: IRStore = {
      nodeId: "s#orphan",
      name: "orphanStore",
      items: [{ kind: "char", value: "a" }, { kind: "char", value: "b" }],
      isSystem: false,
    };
    const ir = makeTestIR([], [store]);

    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["s#orphan#0"]),
    );

    expect(warnings).toHaveLength(0);
    expect(appliedCount).toBe(1);
    const resultStore = result.stores.find((s) => s.nodeId === "s#orphan");
    expect(resultStore!.items).toEqual([{ kind: "char", value: "b" }]);
  });

  it("targets the true items[] index with mixed vkey/char items; skipping a non-char index warns without dropping it", () => {
    const store: IRStore = {
      nodeId: "s#mixed",
      name: "mixedStore",
      items: [
        { kind: "vkey", name: "K_A" }, // index 0 — non-char, not droppable
        { kind: "char", value: "b" }, // index 1 — char
        { kind: "char", value: "c" }, // index 2 — char
      ],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "any", storeRef: "mixedStore" }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);

    // Target index 0 (vkey, not droppable) and index 1 (char, droppable).
    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["s#mixed#0", "s#mixed#1"]),
    );

    expect(appliedCount).toBe(1);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes("not a char item"))).toBe(true);

    const resultStore = result.stores.find((s) => s.nodeId === "s#mixed");
    // Only the char at index 1 was dropped; the vkey at (former) index 0 survives.
    expect(resultStore!.items).toEqual([
      { kind: "vkey", name: "K_A" },
      { kind: "char", value: "c" },
    ]);
  });

  it("structural sharing: an untouched store keeps the same object reference through a drop", () => {
    const dropStore: IRStore = {
      nodeId: "s#drop",
      name: "dropStore",
      items: [{ kind: "char", value: "a" }, { kind: "char", value: "b" }],
      isSystem: false,
    };
    const untouchedStore: IRStore = {
      nodeId: "s#untouched",
      name: "untouchedStore",
      items: [{ kind: "char", value: "x" }],
      isSystem: false,
    };
    const ir = makeTestIR([], [dropStore, untouchedStore]);

    const { ir: result } = applyStoreSlotRemovals(ir, new Set(["s#drop#0"]));

    const untouchedInResult = result.stores.find((s) => s.nodeId === "s#untouched");
    expect(untouchedInResult).toBe(untouchedStore);
  });

  it("multiple drops in one store in one pass (descending-index safety)", () => {
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

    // Target indices out of ascending order to prove the filter approach
    // (not manual splicing) handles this correctly regardless of Set iteration order.
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

  it("dropping the last item in a store emits the empty-store warning", () => {
    const store: IRStore = {
      nodeId: "s#last",
      name: "lastStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const ir = makeTestIR([], [store]);

    const { ir: result, warnings, appliedCount } = applyStoreSlotRemovals(
      ir,
      new Set(["s#last#0"]),
    );

    expect(appliedCount).toBe(1);
    const resultStore = result.stores.find((s) => s.nodeId === "s#last");
    expect(resultStore!.items).toEqual([]);
    expect(
      warnings.some((w) => w.includes('store "lastStore" is now empty')),
    ).toBe(true);
  });
});
