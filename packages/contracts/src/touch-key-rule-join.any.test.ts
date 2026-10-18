/**
 * Key-position `any(store)` expansion in the touch key↔rule join (spec 104
 * foundation gap).
 *
 * The join originally indexed only rules with a literal vkey element. A rule
 * whose struck key arrives through a key-position `any()` — the fv_ fan shape
 * `+ any(fanHkeys) > index(fanH,1)`, where parallel stores hold the fan's keys
 * and their outputs — produced NO bindings, so the spec 104 resolver reported
 * production `none` for keys real KeymanWeb produces from, coverage
 * under-credited them, diagnostics could call them dead, and carve of a fan
 * character silently no-opped.
 *
 * These tests pin the expansion:
 *   - ONLY the key position expands (a context-position `any()` creates no
 *     bindings for the keys it names);
 *   - only store items that are vkey references expand (a store of characters
 *     matches typed context, not struck keys);
 *   - an output `index(outStore, n)` aligned with the struck `any()` yields
 *     the per-key aligned item; a literal output applies to every expanded
 *     key; an index that cannot be aligned contributes nothing (the binding
 *     still exists — the key is wired — but no output is invented).
 *
 * The fixture is a minimal fv-shape IR built inline (the shared Cameroon
 * fixture in fixtures/touchKeyRuleJoin.ts is count-pinned by three suites;
 * this shape is a different keyboard family, so it lives here).
 */

import { describe, expect, it } from "vitest";

import type { IRRule, IRStore, KeyboardIR } from "./keyboard-ir.js";
import { makeTestIR } from "./fixtures/keyboard-ir.js";
import { irGroup, touchKey, touchLayout } from "./fixtures/ir-builders.js";
import {
  bindingsForKeyId,
  buildTouchKeyRuleIndex,
  producedByKeyId,
} from "./touch-key-rule-join.js";
import { resolveTouchProduction } from "./touchProduction.js";
import { findDeadTouchKeys } from "./touch-key-diagnostics.js";
import { computeTouchCoverage } from "./touch-coverage.js";

// ---------------------------------------------------------------------------
// The fv fan fixture: `+ any(fanHkeys) > index(fanH,1)`
// ---------------------------------------------------------------------------

const FAN_KEYS = ["T_H", "T_HI", "T_HU"] as const;
const FAN_OUT = ["ᐸ", "ᐱ", "ᐲ"] as const;

function vkeyStore(nodeId: string, name: string, ids: readonly string[]): IRStore {
  return {
    nodeId,
    name,
    items: ids.map((id) => ({ kind: "vkey", name: id })),
    isSystem: false,
  };
}

function charStore(nodeId: string, name: string, chars: readonly string[]): IRStore {
  return {
    nodeId,
    name,
    items: chars.map((value) => ({ kind: "char", value })),
    isSystem: false,
  };
}

const FAN_RULE: IRRule = {
  nodeId: "rule#fan",
  context: [
    { kind: "raw", text: "+" },
    { kind: "any", storeRef: "fanHkeys" },
  ],
  output: [{ kind: "index", storeRef: "fanH", offset: 1 }],
};

function fanIR(rules: readonly IRRule[], extraStores: readonly IRStore[] = []): KeyboardIR {
  return makeTestIR(
    [irGroup({ name: "main", usingKeys: true, rules: [...rules] })],
    [
      vkeyStore("store#fanHkeys", "fanHkeys", FAN_KEYS),
      charStore("store#fanH", "fanH", FAN_OUT),
      ...extraStores,
    ],
  );
}

// ---------------------------------------------------------------------------
// Join-level expansion
// ---------------------------------------------------------------------------

describe("key-position any() expansion — the fv fan", () => {
  it("emits a binding for every vkey item of the key store", () => {
    const idx = buildTouchKeyRuleIndex(fanIR([FAN_RULE]));
    for (const id of FAN_KEYS) {
      const bindings = bindingsForKeyId(idx, id);
      expect(bindings).toHaveLength(1);
      expect(bindings[0]?.ruleNodeId).toBe("rule#fan");
      expect(bindings[0]?.groupName).toBe("main");
      expect(bindings[0]?.role).toBe("produces");
      expect(bindings[0]?.keyIdAsWritten).toBe(id);
      expect(idx.producingIds.has(id)).toBe(true);
    }
  });

  it("aligns index() output per key: the i-th key item produces the i-th output item", () => {
    const idx = buildTouchKeyRuleIndex(fanIR([FAN_RULE]));
    expect(producedByKeyId(idx, "T_H")).toEqual(["ᐸ"]);
    expect(producedByKeyId(idx, "T_HI")).toEqual(["ᐱ"]);
    expect(producedByKeyId(idx, "T_HU")).toEqual(["ᐲ"]);
  });

  it("a literal output applies to every expanded key", () => {
    const rule: IRRule = {
      nodeId: "rule#fan-literal",
      context: [
        { kind: "raw", text: "+" },
        { kind: "any", storeRef: "fanHkeys" },
      ],
      output: [{ kind: "char", value: "q" }],
    };
    const idx = buildTouchKeyRuleIndex(fanIR([rule]));
    for (const id of FAN_KEYS) {
      expect(producedByKeyId(idx, id)).toEqual(["q"]);
    }
  });

  it("an index() that does not point at the struck any() contributes no invented output — but the binding stands", () => {
    // Pre-context any() at position 1, struck fan any() at position 2; the
    // output index reads position 1, which per-key alignment cannot resolve.
    const rule: IRRule = {
      nodeId: "rule#fan-unaligned",
      context: [
        { kind: "any", storeRef: "pre" },
        { kind: "raw", text: "+" },
        { kind: "any", storeRef: "fanHkeys" },
      ],
      output: [{ kind: "index", storeRef: "fanH", offset: 1 }],
    };
    const ir = fanIR([rule], [charStore("store#pre", "pre", ["x"])]);
    const idx = buildTouchKeyRuleIndex(ir);
    for (const id of FAN_KEYS) {
      const bindings = bindingsForKeyId(idx, id);
      expect(bindings).toHaveLength(1);
      expect(bindings[0]?.produced).toEqual([]);
      expect(idx.producingIds.has(id)).toBe(false);
    }
  });

  it("an index() aligned with a pre-context-guarded fan still aligns (offset counts the struck position)", () => {
    const rule: IRRule = {
      nodeId: "rule#fan-guarded",
      context: [
        { kind: "any", storeRef: "pre" },
        { kind: "raw", text: "+" },
        { kind: "any", storeRef: "fanHkeys" },
      ],
      output: [{ kind: "index", storeRef: "fanH", offset: 2 }],
    };
    const ir = fanIR([rule], [charStore("store#pre", "pre", ["x"])]);
    const idx = buildTouchKeyRuleIndex(ir);
    expect(producedByKeyId(idx, "T_HI")).toEqual(["ᐱ"]);
    expect(bindingsForKeyId(idx, "T_HI")[0]?.contextGuarded).toBe(true);
  });
});

describe("what does NOT expand", () => {
  it("a context-position any() creates no bindings for the keys it names", () => {
    const rule: IRRule = {
      nodeId: "rule#context-any",
      context: [
        { kind: "any", storeRef: "letters" },
        { kind: "raw", text: "+" },
        { kind: "vkey", name: "K_A", modifiers: [] },
      ],
      output: [{ kind: "char", value: "x" }],
    };
    const ir = makeTestIR(
      [irGroup({ name: "main", usingKeys: true, rules: [rule] })],
      [vkeyStore("store#letters", "letters", ["K_B", "K_C"])],
    );
    const idx = buildTouchKeyRuleIndex(ir);
    expect(bindingsForKeyId(idx, "K_A")).toHaveLength(1);
    expect(bindingsForKeyId(idx, "K_B")).toEqual([]);
    expect(bindingsForKeyId(idx, "K_C")).toEqual([]);
  });

  it("a key-position any() over a store of characters does not expand", () => {
    const rule: IRRule = {
      nodeId: "rule#char-any",
      context: [
        { kind: "raw", text: "+" },
        { kind: "any", storeRef: "chars" },
      ],
      output: [{ kind: "char", value: "z" }],
    };
    const ir = makeTestIR(
      [irGroup({ name: "main", usingKeys: true, rules: [rule] })],
      [charStore("store#chars", "chars", ["a", "b"])],
    );
    const idx = buildTouchKeyRuleIndex(ir);
    expect(idx.byId.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Consumer-level consequences (resolver / diagnostics / coverage)
// ---------------------------------------------------------------------------

describe("consumers see the fan keys as producing", () => {
  const layout = touchLayout({
    keys: [...FAN_KEYS.map((id) => touchKey({ id })), touchKey({ id: "T_NORULE" })],
  });

  it("the resolver reports the aligned syllable with source \"rule\"", () => {
    const ir = fanIR([FAN_RULE]);
    const ruleIndex = buildTouchKeyRuleIndex(ir);
    const rec = resolveTouchProduction(
      { ir, ruleIndex },
      touchKey({ id: "T_HI" }),
      { modifiers: [] },
    );
    expect(rec.source).toBe("rule");
    expect(rec.productions).toContainEqual({ output: { kind: "text", text: "ᐱ" } });
  });

  it("diagnostics does NOT report the fan keys dead (and still reports a rule-free key)", () => {
    const ir = { ...fanIR([FAN_RULE]), touchLayout: layout } as KeyboardIR;
    const ruleIndex = buildTouchKeyRuleIndex(ir);
    const findings = findDeadTouchKeys({ ir, layout, ruleIndex });
    const deadIds = findings.map((f) => f.fields.keyId);
    for (const id of FAN_KEYS) expect(deadIds).not.toContain(id);
    expect(deadIds).toContain("T_NORULE");
  });

  it("coverage credits the fan syllables", () => {
    const ir = fanIR([FAN_RULE]);
    const ruleIndex = buildTouchKeyRuleIndex(ir);
    const { uncovered } = computeTouchCoverage(layout, [...FAN_OUT], { ruleIndex, ir });
    expect(uncovered).toEqual([]);
  });
});
