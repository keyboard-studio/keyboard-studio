// Tests for guardRuleSynthesis (spec 082 FR-020): "Add all" mirrors the
// guard family's own template rule, is idempotent on re-run, and never
// guesses — entries it cannot shape are skipped and counted.

import { describe, expect, it } from "vitest";
import type { IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import {
  synthesizeMissingGuardRules,
  targetGroupForSynthesis,
} from "./guardRuleSynthesis.ts";
import { groupRules } from "./ruleFamilies.ts";
import type { MissingGuardGroup } from "./guardAnalysis.ts";

const ACUTE = "́";

function diablockRule(nodeId: string, vkey: string): IRRule {
  return {
    nodeId,
    context: [
      { kind: "any", storeRef: "diablock" },
      { kind: "raw", text: "+" },
      { kind: "vkey", name: vkey, modifiers: ["RALT"] },
    ],
    output: [{ kind: "raw", text: "context" }],
  };
}

function makeIr(rules: IRRule[]): KeyboardIR {
  return {
    origin: "scaffolded",
    header: { keyboardId: "t", name: "t", bcp47: [], copyright: "", version: "1.0", targets: [], storeDirectives: [] },
    stores: [],
    groups: [
      { nodeId: "g1", name: "main", usingKeys: true, rules, readonly: false },
    ],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  } as unknown as KeyboardIR;
}

const GROUP: MissingGuardGroup = {
  store: "diablock",
  familyName: "Diacritic blocking",
  missing: [
    { key: "K_E", outputChar: ACUTE, outputName: "COMBINING ACUTE ACCENT", suggestedStore: "diablock" },
    { key: "K_O", outputChar: "̧", suggestedStore: "diablock" },
  ],
};

function familiesFor(ir: KeyboardIR) {
  return groupRules(ir.groups.flatMap((g) => g.rules));
}

describe("synthesizeMissingGuardRules", () => {
  it("mirrors the family template, substituting the key and keeping modifiers", () => {
    const ir = makeIr([diablockRule("r1", "K_C"), diablockRule("r2", "K_D")]);
    const { rules, alreadyCovered, noTemplate } = synthesizeMissingGuardRules(
      ir,
      GROUP,
      familiesFor(ir),
    );
    expect(alreadyCovered).toBe(0);
    expect(noTemplate).toBe(0);
    expect(rules).toHaveLength(2);
    expect(rules[0]?.context).toEqual([
      { kind: "any", storeRef: "diablock" },
      { kind: "raw", text: "+" },
      { kind: "vkey", name: "K_E", modifiers: ["RALT"] },
    ]);
    expect(rules[0]?.output).toEqual([{ kind: "raw", text: "context" }]);
    expect(rules[1]?.context[2]).toEqual({ kind: "vkey", name: "K_O", modifiers: ["RALT"] });
    // Fresh ids, honest provenance.
    expect(rules[0]?.nodeId).not.toBe("r1");
    expect(rules[0]?.trailingComment).toBe("added from guard suggestion");
  });

  it("skips entries already covered — re-running adds nothing", () => {
    const ir = makeIr([diablockRule("r1", "K_C")]);
    const families = familiesFor(ir);
    const first = synthesizeMissingGuardRules(ir, GROUP, families);
    expect(first.rules).toHaveLength(2);
    // Stage the synthesized rules as "Add all" would, then re-run.
    const ir2 = makeIr([diablockRule("r1", "K_C"), ...first.rules]);
    const second = synthesizeMissingGuardRules(ir2, GROUP, familiesFor(ir2));
    expect(second.rules).toHaveLength(0);
    expect(second.alreadyCovered).toBe(2);
    expect(second.noTemplate).toBe(0);
  });

  it("skips a key the family already guards", () => {
    const ir = makeIr([diablockRule("r1", "K_E")]);
    const { rules, alreadyCovered } = synthesizeMissingGuardRules(ir, GROUP, familiesFor(ir));
    expect(rules).toHaveLength(1); // only K_O
    expect(rules[0]?.context[2]).toEqual({ kind: "vkey", name: "K_O", modifiers: ["RALT"] });
    expect(alreadyCovered).toBe(1);
  });

  it("substitutes the mark char when the template matches on characters", () => {
    const charRule: IRRule = {
      nodeId: "r1",
      context: [
        { kind: "any", storeRef: "diablock" },
        { kind: "raw", text: "+" },
        { kind: "char", value: "̧" },
      ],
      output: [{ kind: "raw", text: "context" }],
    };
    const ir = makeIr([charRule]);
    const { rules } = synthesizeMissingGuardRules(ir, GROUP, familiesFor(ir));
    expect(rules[0]?.context[2]).toEqual({ kind: "char", value: ACUTE });
  });
});

describe("targetGroupForSynthesis", () => {
  it("targets the family's own group", () => {
    const ir = makeIr([diablockRule("r1", "K_C")]);
    expect(targetGroupForSynthesis(ir, familiesFor(ir), "diablock")).toEqual({ groupIndex: 0 });
  });

  it("returns null when every group is readonly", () => {
    const ir = makeIr([diablockRule("r1", "K_C")]);
    ir.groups[0]!.readonly = true;
    expect(targetGroupForSynthesis(ir, familiesFor(ir), "diablock")).toBeNull();
  });
});
