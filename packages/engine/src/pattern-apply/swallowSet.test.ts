// Stub-enumeration tests for the FR-005 `swallowUndefined` skip-set seam
// (spec 076, issue #1802, T014).
//
// `swallowUndefined` itself is NOT built here — full FR-005 is future work.
// These tests pin the contract it will consume: for each representative
// carved combination, the verdict `isInSwallowSet` must return.
//
// Enumeration key (FR-005 amendment):
// - carved combos ENTER the swallow set on recompile,
// - EXCEPT `allow-host` dispositions (the author allowed host fallback), and
// - EXCEPT combos covered by behaviour-owned rules (no double emission,
//   no shadowing surprises).

import { describe, it, expect } from "vitest";
import { isInSwallowSet } from "./swallowSet.js";
import { compileCarveSuppression } from "./carveSuppression.js";
import { charStore, charRule, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import type {
  CarveDisposition,
  IRRule,
  KeyboardIR,
} from "@keyboard-studio/contracts";

const bulk = (comboId: string, disposition: CarveDisposition["disposition"]): CarveDisposition => ({
  comboId,
  disposition,
  provenance: "bulk-default",
});

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
              { kind: "any", storeRef: "dkf003b" },
            ],
            output: [{ kind: "index", storeRef: "dkt003b", offset: 2 }],
          }),
        ],
      },
    ],
  }) as KeyboardIR;

describe("isInSwallowSet — FR-005 skip-set seam (T014)", () => {
  it("block rule carve covered by the suppression rewrite is skipped", () => {
    const dispositions = [bulk("r1", "block")];
    const suppressed = compileCarveSuppression(bareKeyIR(), dispositions).ir;
    // The rewritten rule now carries ownedByBehaviour: "carve-suppression".
    expect(suppressed.groups[0]!.rules[0]!.ownedByBehaviour).toBe("carve-suppression");
    expect(isInSwallowSet({ comboId: "r1" }, dispositions, suppressed)).toBe(false);
  });

  it("block rule carve not yet covered enters the set (safety net)", () => {
    // Pre-suppression IR: the rule is still unowned — the leak is open, so
    // the combo enters the swallow set until suppression covers it.
    const dispositions = [bulk("r1", "block")];
    expect(isInSwallowSet({ comboId: "r1" }, dispositions, bareKeyIR())).toBe(true);
  });

  it("allow-host rule carve is excluded, pre- and post-suppression", () => {
    const dispositions = [bulk("r1", "allow-host")];
    expect(isInSwallowSet({ comboId: "r1" }, dispositions, bareKeyIR())).toBe(false);
    const suppressed = compileCarveSuppression(bareKeyIR(), dispositions).ir;
    expect(isInSwallowSet({ comboId: "r1" }, dispositions, suppressed)).toBe(false);
  });

  it("a suppression-owned rule is skipped even with no disposition record", () => {
    const ir = bareKeyIR();
    (ir.groups[0]!.rules[0] as IRRule).ownedByBehaviour = "carve-suppression";
    expect(isInSwallowSet({ comboId: "r1" }, [], ir)).toBe(false);
  });

  it("any behaviour owner counts as covered, not just carve-suppression", () => {
    // FR-002 mutual exclusivity: at most one behaviour owns a rule, and any
    // owner implies deterministic handling the swallow compiler must not
    // second-guess.
    const ir = bareKeyIR();
    (ir.groups[0]!.rules[0] as IRRule).ownedByBehaviour = "mark-on-non-base";
    expect(isInSwallowSet({ comboId: "r1" }, [], ir)).toBe(false);
  });

  it("block store-slot carve covered by a synthesized guard is skipped", () => {
    const dispositions = [bulk("store#dkt003b#1", "block")];
    const suppressed = compileCarveSuppression(deadkeySlotIR(), dispositions).ir;
    const guard = suppressed.groups[0]!.rules.find((r) =>
      r.nodeId.startsWith("gen-carve-guard-store#dkt003b-1-"),
    );
    expect(guard?.ownedByBehaviour).toBe("carve-suppression");
    expect(
      isInSwallowSet({ comboId: "store#dkt003b#1" }, dispositions, suppressed),
    ).toBe(false);
  });

  it("block store-slot carve with no guard enters the set (safety net)", () => {
    // No paired any() rule consumes the store, so no guard is synthesized —
    // the leak is still open.
    const ir: KeyboardIR = {
      nodeId: "kbd",
      stores: [charStore({ nodeId: "store#lone", name: "lone", chars: ["a", "b"] })],
      groups: [{ nodeId: "group#main", rules: [] }],
    } as KeyboardIR;
    const dispositions = [bulk("store#lone#0", "block")];
    const suppressed = compileCarveSuppression(ir, dispositions).ir;
    expect(
      suppressed.groups[0]!.rules.some((r) => r.nodeId.startsWith("gen-carve-guard-")),
    ).toBe(false);
    expect(isInSwallowSet({ comboId: "store#lone#0" }, dispositions, suppressed)).toBe(
      true,
    );
  });

  it("allow-host store-slot carve is excluded", () => {
    const dispositions = [bulk("store#dkt003b#1", "allow-host")];
    const suppressed = compileCarveSuppression(deadkeySlotIR(), dispositions).ir;
    expect(
      isInSwallowSet({ comboId: "store#dkt003b#1" }, dispositions, suppressed),
    ).toBe(false);
  });

  it("a never-carved undefined combo enters the set (FR-005 core job)", () => {
    expect(isInSwallowSet({ comboId: "K_Q+shift" }, [], bareKeyIR())).toBe(true);
  });

  it("a combo with no disposition record but an unowned rule enters (fail-safe)", () => {
    // Pre-fill (T010) guarantees dispositions for carved combos; if the
    // record is missing the ruling's "suppress by default" wins over an
    // open leak.
    expect(isInSwallowSet({ comboId: "r1" }, [], bareKeyIR())).toBe(true);
  });

  it("duplicate dispositions resolve first-wins, mirroring the compiler", () => {
    const ir = bareKeyIR();
    expect(
      isInSwallowSet(
        { comboId: "r1" },
        [bulk("r1", "block"), bulk("r1", "allow-host")],
        ir,
      ),
    ).toBe(true);
    expect(
      isInSwallowSet(
        { comboId: "r1" },
        [bulk("r1", "allow-host"), bulk("r1", "block")],
        ir,
      ),
    ).toBe(false);
  });

  it("a rule nodeId that parses as a slot id is treated as a rule", () => {
    // Mirrors compileSlotGuards' precedence: rule nodeIds win over slot ids.
    const owned = bareKeyIR("rulename#1");
    (owned.groups[0]!.rules[0] as IRRule).ownedByBehaviour = "carve-suppression";
    expect(isInSwallowSet({ comboId: "rulename#1" }, [], owned)).toBe(false);

    const unowned = bareKeyIR("rulename#1");
    expect(isInSwallowSet({ comboId: "rulename#1" }, [], unowned)).toBe(true);
  });

  it("is pure: it never mutates the IR or the dispositions", () => {
    const ir = deadkeySlotIR();
    const dispositions = [bulk("store#dkt003b#1", "block"), bulk("r1", "allow-host")];
    const irBefore = structuredClone(ir);
    const dispBefore = structuredClone(dispositions);
    isInSwallowSet({ comboId: "store#dkt003b#1" }, dispositions, ir);
    isInSwallowSet({ comboId: "nope" }, dispositions, ir);
    expect(ir).toEqual(irBefore);
    expect(dispositions).toEqual(dispBefore);
  });
});
