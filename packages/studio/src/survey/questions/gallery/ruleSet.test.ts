// ruleSet module tests (spec 090 T034/T036): the module contract and
// the splice apply — deterministic, in working order, and never
// resurrecting a rule the recorded carve decision removed. The hosted
// step flow is covered by the rules suites (components/rules,
// survey/rules).

import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import ruleSet, { type RuleSetValue } from "./ruleSet.ts";
import { RulesDecisionRenderer } from "../../rules/RulesDecisionRenderer.tsx";
import type { ApplyContext } from "../../types.ts";

function ctx(ir: ApplyContext["ir"], decisions: ApplyContext["decisions"] = {}): ApplyContext {
  return { ir, writes: ruleSet.writes, decisions, currentHistoryEntryState: null };
}

function rule(nodeId: string, output: string, added = false): IRRule {
  return {
    nodeId,
    context: [{ kind: "char", value: "a" }],
    output: [{ kind: "char", value: output }],
    ...(added ? { rulesStepAdded: true as const } : {}),
  } as IRRule;
}

function baseIr(): KeyboardIR {
  return makeTestIR([
    { nodeId: "g-main", name: "main", usingKeys: true, rules: [rule("r-base", "a")] },
  ]);
}

const VALUE: RuleSetValue = {
  groups: [
    {
      groupNodeId: "g-main",
      workingOrder: ["r-base", "r-added"],
      added: [rule("r-added", "á", true)],
    },
  ],
  stores: [],
};

describe("ruleSet module contract", () => {
  it("provides rule-set, requires deadkeys-defined + windows-layout, writes groups/stores", () => {
    expect(ruleSet.provides).toEqual(["rule-set"]);
    expect(ruleSet.requires).toEqual(["deadkeys-defined", "windows-layout"]);
    expect(ruleSet.writes.map((p) => p[0])).toEqual(["groups", "stores"]);
    expect(ruleSet.renderer).toBe(RulesDecisionRenderer);
    expect(ruleSet.extract).toBeUndefined();
  });

  it("apply with no value, no IR, or no additions writes nothing", () => {
    const ir = baseIr();
    expect(ruleSet.apply(undefined, ctx(ir))).toEqual({});
    expect(ruleSet.apply(VALUE, ctx(null))).toEqual({});
    expect(ruleSet.apply({ groups: [], stores: [] }, ctx(ir))).toEqual({});
  });
});

describe("ruleSet apply (splice)", () => {
  it("splices the additions into the base IR in working order, deterministically", () => {
    const ir = baseIr();
    const first = ruleSet.apply(VALUE, ctx(ir));
    const second = ruleSet.apply(VALUE, ctx(ir));
    expect(first).toEqual(second);
    const spliced = { ...ir, ...first.ir };
    expect(spliced.groups[0]!.rules.map((r) => r.nodeId)).toEqual(["r-base", "r-added"]);
  });

  it("never resurrects an addition the recorded carve decision removed", () => {
    const ir = baseIr();
    const decisions: ApplyContext["decisions"] = {
      "carved-layout": {
        id: "carved-layout",
        provenance: "asked",
        value: {
          removals: [{ kind: "node", id: "r-added", provenance: "asked" }],
          dispositions: [],
          closedKeyboardCard: null,
        },
      },
    };
    expect(ruleSet.apply(VALUE, ctx(ir, decisions))).toEqual({});
  });
});
