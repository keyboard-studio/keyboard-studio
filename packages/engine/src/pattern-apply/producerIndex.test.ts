// Tests for buildProducerIndex — the "how many places emit this character?"
// index behind the carve collateral guard's FR-003(b) test (spec 051 T008).
//
// Coverage:
//   1. A base rule whose entire output is one char counts as a producer.
//   2. An output-store slot (index()/outs()) counts once PER SLOT, and only once
//      even when two rules fan out the same store.
//   3. A character living ONLY in an any()-consumed input store is ABSENT —
//      a trigger is not a producer (FR-002). This is the defect the whole
//      feature turns on.
//   4. An S-02 deadkey trigger rule is not counted.
//   5. A notany() store is not counted.
//   6. Agreement with collectCharContributors on a keyboard with no input-store
//      occurrences (data-model §2).

import { describe, it, expect } from "vitest";
import { buildProducerIndex } from "./producerIndex.js";
import { collectCharContributors } from "./collectCharContributors.js";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR, IRStore, IRGroup, IRRule, StoreItem } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeStore(nodeId: string, name: string, items: StoreItem[]): IRStore {
  return { nodeId, name, items, isSystem: false };
}

function chars(values: string[]): StoreItem[] {
  return values.map((value) => ({ kind: "char" as const, value }));
}

function makeGroup(rules: IRRule[]): IRGroup {
  return { nodeId: "group#main", name: "main", usingKeys: true, rules, readonly: false };
}

/** `+ [K_X] > 'ch'` — a whole-rule single-char producer. */
function makeBaseRule(nodeId: string, vkey: string, ch: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers: [] }],
    output: [{ kind: "char", value: ch }],
  };
}

/** `dk(id) any(inName) > index(outName, 2)` — the Cameroon deadkey fan-out shape. */
function makeFanOutRule(nodeId: string, dkId: number, inName: string, outName: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "deadkey", id: dkId }, { kind: "any", storeRef: inName }],
    output: [{ kind: "index", storeRef: outName, offset: 2 }],
  };
}

/**
 * The Cameroon-shaped pair: `i` lives only in the any()-consumed INPUT store
 * (plus its own base rule); `ɨ` is emitted through the OUTPUT store.
 */
function makeCameroonIr(): KeyboardIR {
  const dkf = makeStore("store#dkf", "dkf0060", chars(["a", "i", "u"]));
  const dkt = makeStore("store#dkt", "dkt0060", chars(["à", "ɨ", "ù"]));
  return makeTestIR(
    [
      makeGroup([
        makeBaseRule("rule#i", "K_I", "i"),
        makeFanOutRule("rule#fanout", 0x0060, "dkf0060", "dkt0060"),
      ]),
    ],
    [dkf, dkt],
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildProducerIndex", () => {
  it("counts a base rule whose entire output is one character", () => {
    const ir = makeTestIR([makeGroup([makeBaseRule("rule#i", "K_I", "i")])], []);
    expect(buildProducerIndex(ir).get("i")).toBe(1);
  });

  it("counts an output-store slot once per matching slot", () => {
    const dkf = makeStore("store#dkf", "dkfX", chars(["a", "e"]));
    // 'ǎ' appears in TWO slots of the same output store → two producers.
    const dkt = makeStore("store#dkt", "dktX", chars(["ǎ", "ǎ"]));
    const ir = makeTestIR([makeGroup([makeFanOutRule("rule#f", 0x003b, "dkfX", "dktX")])], [dkf, dkt]);
    expect(buildProducerIndex(ir).get("ǎ")).toBe(2);
  });

  it("counts a store slot ONCE even when two rules fan out the same store", () => {
    const dkf = makeStore("store#dkf", "dkfX", chars(["a"]));
    const dkt = makeStore("store#dkt", "dktX", chars(["ǎ"]));
    const ir = makeTestIR(
      [
        makeGroup([
          makeFanOutRule("rule#f1", 0x003b, "dkfX", "dktX"),
          makeFanOutRule("rule#f2", 0x003c, "dkfX", "dktX"),
        ]),
      ],
      [dkf, dkt],
    );
    // The slot is the surgical unit — two keys reaching it is still one producer.
    expect(buildProducerIndex(ir).get("ǎ")).toBe(1);
  });

  it("does NOT count a character that appears only in an any()-consumed input store (FR-002)", () => {
    const dkf = makeStore("store#dkf", "dkfX", chars(["q"]));
    const dkt = makeStore("store#dkt", "dktX", chars(["ɋ"]));
    const ir = makeTestIR([makeGroup([makeFanOutRule("rule#f", 0x003b, "dkfX", "dktX")])], [dkf, dkt]);
    const index = buildProducerIndex(ir);
    expect(index.get("ɋ")).toBe(1); // emitted through the output store
    expect(index.get("q")).toBeUndefined(); // typed, never emitted
  });

  it("does NOT count an S-02 deadkey trigger rule", () => {
    const rule: IRRule = {
      nodeId: "rule#trigger",
      context: [{ kind: "vkey", name: "K_BKQUOTE", modifiers: [] }],
      output: [{ kind: "deadkey", id: 0x0060 }],
    };
    const ir = makeTestIR([makeGroup([rule])], []);
    expect(buildProducerIndex(ir).size).toBe(0);
  });

  it("does NOT count a notany() store — dropping from it widens matching", () => {
    const excl = makeStore("store#excl", "exclX", chars(["z"]));
    const rule: IRRule = {
      nodeId: "rule#notany",
      context: [{ kind: "notany", storeRef: "exclX" }, { kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "char", value: "a" }],
    };
    const ir = makeTestIR([makeGroup([rule])], [excl]);
    const index = buildProducerIndex(ir);
    expect(index.get("a")).toBe(1);
    expect(index.get("z")).toBeUndefined();
  });

  it("does NOT count a character buried inside a longer literal output", () => {
    const rule: IRRule = {
      nodeId: "rule#multi",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "char", value: "ab" }],
    };
    const ir = makeTestIR([makeGroup([rule])], []);
    const index = buildProducerIndex(ir);
    expect(index.get("ab")).toBe(1); // the whole output is the producer
    expect(index.get("a")).toBeUndefined();
  });

  it("on the Cameroon shape: ɨ has one producer, i has one (its own base rule, not the input store)", () => {
    const index = buildProducerIndex(makeCameroonIr());
    expect(index.get("ɨ")).toBe(1);
    // 'i' is in dkf0060 (input) AND has `+ [K_I] > 'i'`. Only the rule counts.
    expect(index.get("i")).toBe(1);
  });

  it("agrees with collectCharContributors when there are no input-store occurrences (data-model §2)", () => {
    // 'ɨ' occurs only in the OUTPUT store, so contributor count == producer count.
    const ir = makeCameroonIr();
    const contributors = collectCharContributors(ir, "ɨ");
    expect(contributors.storeSlots.every((s) => s.role === "output")).toBe(true);
    const expected = contributors.ruleNodeIds.length + contributors.storeSlotIds.length;
    expect(buildProducerIndex(ir).get("ɨ")).toBe(expected);
  });

  it("differs from collectCharContributors EXACTLY on the input side (data-model §2)", () => {
    // The complement of the test above, and the one that actually pins the
    // distinction: 'i' has BOTH an input-store slot (any()-consumed dkf0060) and
    // a whole-rule producer (`+ [K_I] > 'i'`). The contributor walk must see the
    // input slot — a removal has to reach every store the char appears in — and
    // the producer index must NOT, because typing it is not producing it.
    const ir = makeCameroonIr();
    const contributors = collectCharContributors(ir, "i");

    const inputSlots = contributors.storeSlots.filter((s) => s.role === "input");
    expect(inputSlots).toHaveLength(1); // the dkf0060 trigger slot
    expect(contributors.ruleNodeIds).toEqual(["rule#i"]);

    // Naively counting contributors would give 2; the producer count is 1, and the
    // difference is exactly the input slots the two walks treat differently.
    const naive = contributors.ruleNodeIds.length + contributors.storeSlotIds.length;
    expect(naive).toBe(2);
    expect(buildProducerIndex(ir).get("i")).toBe(naive - inputSlots.length);
  });
});
