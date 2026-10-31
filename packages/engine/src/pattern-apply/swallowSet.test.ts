// Stub-enumeration tests for the FR-005 `swallowUndefined` skip-set seam
// (spec 076, T014).
//
// `swallowUndefined` itself is NOT built here — full FR-005 is future work.
// These tests pin the contract it will consume: for each representative
// carved combination, the verdict `isInSwallowSet` must return.
//
// Enumeration key (FR-005 amendment):
// - carved combos ENTER the swallow set on recompile,
// - EXCEPT under the `pass-through` fallback policy (the author allowed host
//   fallback keyboard-wide), and
// - EXCEPT combos covered by behaviour-owned rules (no double emission,
//   no shadowing surprises).

import { describe, it, expect } from "vitest";
import { isInSwallowSet } from "./swallowSet.js";
import { compileCarveSuppression } from "./carveSuppression.js";
import { charStore, charRule, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import { dispositionsForFallbackPolicy } from "./fallbackPolicy.js";
import type { IRRule, KeyboardIR } from "@keyboard-studio/contracts";

// A minimal pre-carve IR: one bare-key rule.
const bareKeyIR = (ruleId = "r1"): KeyboardIR =>
  ({
    nodeId: "kbd",
    stores: [],
    groups: [
      {
        nodeId: "group#main",
        rules: [vkeyRule({ nodeId: ruleId, vkey: "K_E", output: "é" })],
      },
    ],
  }) as KeyboardIR;

// Deadkey fan-out pair (Cameroon pattern, cf. the T013 fixtures): the paired
// rule consumes the input store via any() and emits via index().
const deadkeySlotIR = (): KeyboardIR =>
  ({
    nodeId: "kbd",
    stores: [
      charStore({ nodeId: "store#dkf003b", name: "dkf003b", chars: ["e", "E"] }),
      charStore({ nodeId: "store#dkt003b", name: "dkt003b", chars: ["é", "É"] }),
    ],
    groups: [
      {
        nodeId: "group#main",
        rules: [
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
      },
    ],
  }) as KeyboardIR;

describe("isInSwallowSet — FR-005 skip-set seam (T014)", () => {
  it("swallow: rule carve covered by the suppression rewrite is skipped", () => {
    const dispositions = dispositionsForFallbackPolicy("swallow", ["r1"]);
    const suppressed = compileCarveSuppression(bareKeyIR(), dispositions).ir;
    // The rewritten rule now carries ownedByBehaviour: "carve-suppression".
    expect(suppressed.groups[0]!.rules[0]!.ownedByBehaviour).toBe("carve-suppression");
    expect(isInSwallowSet({ comboId: "r1" }, "swallow", suppressed)).toBe(false);
  });

  it("swallow: rule carve not yet covered enters the set (safety net)", () => {
    // Pre-suppression IR: the rule is still unowned — the leak is open, so
    // the combo enters the swallow set until suppression covers it.
    expect(isInSwallowSet({ comboId: "r1" }, "swallow", bareKeyIR())).toBe(true);
  });

  it("pass-through: nothing enters the set, pre- and post-suppression", () => {
    expect(isInSwallowSet({ comboId: "r1" }, "pass-through", bareKeyIR())).toBe(false);
    const dispositions = dispositionsForFallbackPolicy("pass-through", ["r1"]);
    const suppressed = compileCarveSuppression(bareKeyIR(), dispositions).ir;
    expect(isInSwallowSet({ comboId: "r1" }, "pass-through", suppressed)).toBe(false);
    expect(isInSwallowSet({ comboId: "K_Q+shift" }, "pass-through", bareKeyIR())).toBe(false);
  });

  it("a suppression-owned rule is skipped under swallow", () => {
    const ir = bareKeyIR();
    (ir.groups[0]!.rules[0] as IRRule).ownedByBehaviour = "carve-suppression";
    expect(isInSwallowSet({ comboId: "r1" }, "swallow", ir)).toBe(false);
  });

  it("any behaviour owner counts as covered, not just carve-suppression", () => {
    // FR-002 mutual exclusivity: at most one behaviour owns a rule, and any
    // owner implies deterministic handling the swallow compiler must not
    // second-guess.
    const ir = bareKeyIR();
    (ir.groups[0]!.rules[0] as IRRule).ownedByBehaviour = "mark-on-non-base";
    expect(isInSwallowSet({ comboId: "r1" }, "swallow", ir)).toBe(false);
  });

  it("swallow: store-slot carve covered by a synthesized guard is skipped", () => {
    const dispositions = dispositionsForFallbackPolicy("swallow", ["store#dkt003b#1"]);
    const suppressed = compileCarveSuppression(deadkeySlotIR(), dispositions).ir;
    const guard = suppressed.groups[0]!.rules.find((r) =>
      r.nodeId.startsWith("gen-carve-guard-store#dkt003b-1-"),
    );
    expect(guard?.ownedByBehaviour).toBe("carve-suppression");
    expect(isInSwallowSet({ comboId: "store#dkt003b#1" }, "swallow", suppressed)).toBe(false);
  });

  it("swallow: store-slot carve with no guard enters the set (safety net)", () => {
    // No paired any() rule consumes the store, so no guard is synthesized —
    // the leak is still open.
    const ir: KeyboardIR = {
      nodeId: "kbd",
      stores: [charStore({ nodeId: "store#lone", name: "lone", chars: ["a", "b"] })],
      groups: [{ nodeId: "group#main", rules: [] }],
    } as KeyboardIR;
    const dispositions = dispositionsForFallbackPolicy("swallow", ["store#lone#0"]);
    const suppressed = compileCarveSuppression(ir, dispositions).ir;
    expect(
      suppressed.groups[0]!.rules.some((r) => r.nodeId.startsWith("gen-carve-guard-")),
    ).toBe(false);
    expect(isInSwallowSet({ comboId: "store#lone#0" }, "swallow", suppressed)).toBe(true);
  });

  it("pass-through: store-slot carve is excluded", () => {
    const dispositions = dispositionsForFallbackPolicy("pass-through", ["store#dkt003b#1"]);
    const suppressed = compileCarveSuppression(deadkeySlotIR(), dispositions).ir;
    expect(isInSwallowSet({ comboId: "store#dkt003b#1" }, "pass-through", suppressed)).toBe(false);
  });

  it("deadkey backstop: pass-through expansion still suppresses a deadkey-context carve", () => {
    // The policy says allow-host, but the compiler coerces deadkey-context
    // carves to block ("deadkey carves never fall through"). The rule ends up
    // behaviour-owned, so the predicate also reports it as covered.
    const ir = deadkeySlotIR();
    const dispositions = dispositionsForFallbackPolicy("pass-through", ["paired"]);
    const suppressed = compileCarveSuppression(ir, dispositions).ir;
    expect(suppressed.groups[0]!.rules.find((r) => r.nodeId === "paired")?.ownedByBehaviour).toBe(
      "carve-suppression",
    );
    expect(isInSwallowSet({ comboId: "paired" }, "swallow", suppressed)).toBe(false);
  });

  it("a never-carved undefined combo enters the set under swallow (FR-005 core job)", () => {
    expect(isInSwallowSet({ comboId: "K_Q+shift" }, "swallow", bareKeyIR())).toBe(true);
  });

  it("a rule nodeId that parses as a slot id is treated as a rule", () => {
    // Mirrors compileSlotGuards' precedence: rule nodeIds win over slot ids.
    const owned = bareKeyIR("rulename#1");
    (owned.groups[0]!.rules[0] as IRRule).ownedByBehaviour = "carve-suppression";
    expect(isInSwallowSet({ comboId: "rulename#1" }, "swallow", owned)).toBe(false);

    const unowned = bareKeyIR("rulename#1");
    expect(isInSwallowSet({ comboId: "rulename#1" }, "swallow", unowned)).toBe(true);
  });

  it("is pure: it never mutates the IR", () => {
    const ir = deadkeySlotIR();
    const irBefore = structuredClone(ir);
    isInSwallowSet({ comboId: "store#dkt003b#1" }, "swallow", ir);
    isInSwallowSet({ comboId: "nope" }, "pass-through", ir);
    expect(ir).toEqual(irBefore);
  });
});

describe("dispositionsForFallbackPolicy", () => {
  it("expands swallow to block and pass-through to allow-host, de-duplicated", () => {
    expect(dispositionsForFallbackPolicy("swallow", ["a", "b", "a"])).toEqual([
      { comboId: "a", disposition: "block", provenance: "bulk-default" },
      { comboId: "b", disposition: "block", provenance: "bulk-default" },
    ]);
    expect(dispositionsForFallbackPolicy("pass-through", ["a"])).toEqual([
      { comboId: "a", disposition: "allow-host", provenance: "bulk-default" },
    ]);
    expect(dispositionsForFallbackPolicy("swallow", [])).toEqual([]);
  });
});
