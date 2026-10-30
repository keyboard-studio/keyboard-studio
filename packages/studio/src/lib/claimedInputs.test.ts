// Spec 106 US4 (FR-040 / FR-041): the starting rules an assignment shadows.

import { describe, it, expect } from "vitest";
import type {
  ContextElement,
  IRGroup,
  IRRule,
  MechanismAssignment,
  MechanismRef,
  Pattern,
} from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { claimedInputRuleIds as claimedWith } from "./claimedInputs.ts";

/** A stand-in pattern whose fragment uses `slot` as a required placeholder. */
function stub(slot: string): Pattern {
  return { kmnFragment: `{{${slot}}}`, questions: [{ id: slot }] } as unknown as Pattern;
}
const PATTERNS: Record<string, Pattern> = {
  simple_swap: stub("kmnRules"),
  deadkey_single_tap: stub("triggerKey"),
  postfix_compose: stub("markKey"),
  modifier_as_layer_switch: stub("altgrKeyList"),
};
const getPattern = (id: string): Pattern | undefined => PATTERNS[id];

function claimedInputRuleIds(
  ir: Parameters<typeof claimedWith>[0],
  assignments: Parameters<typeof claimedWith>[1],
): Set<string> {
  return claimedWith(ir, assignments, getPattern);
}

function vkey(name: string, modifiers: string[] = []): ContextElement {
  return { kind: "vkey", name, modifiers };
}

function rule(nodeId: string, context: ContextElement[]): IRRule {
  return { nodeId, context, output: [{ kind: "char", value: "x" }] };
}

function group(name: string, rules: IRRule[]): IRGroup {
  return { nodeId: `g-${name}`, name, usingKeys: true, readonly: false, rules };
}

function assignment(mech: MechanismRef, target = "x"): MechanismAssignment {
  return { scope: "individual", target, modality: "physical", mechanisms: [mech] };
}

function swap(kmnRules: string): MechanismAssignment {
  return assignment({ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules } });
}

function deadkey(triggerKey: string, escapes?: string): MechanismAssignment {
  return assignment({
    patternId: "deadkey_single_tap",
    strategyId: "S-02",
    slotValues: {
      triggerKey,
      deadkeyName: "caron",
      accentChar: ";",
      ...(escapes !== undefined ? { escapes } : {}),
    },
  });
}

function postfix(markKey: string, escapes: string): MechanismAssignment {
  return assignment({
    patternId: "postfix_compose",
    strategyId: "S-03",
    slotValues: { markKey, markName: "caron", markChar: "̌", escapes },
  });
}

const QUOTE = rule("r-quote", [vkey("K_QUOTE")]);
const SHIFT_QUOTE = rule("r-shift-quote", [vkey("K_QUOTE", ["SHIFT"])]);
const COLON = rule("r-colon", [vkey("K_COLON")]);
const RALT_COLON = rule("r-ralt-colon", [vkey("K_COLON", ["RALT"])]);
const K5 = rule("r-5", [vkey("K_5")]);

function ir(rules: IRRule[] = [QUOTE, SHIFT_QUOTE, COLON, RALT_COLON, K5]) {
  return makeTestIR([group("main", rules)]);
}

describe("claimedInputRuleIds", () => {
  it("a plain override drops the starting rule on the same key", () => {
    expect([...claimedInputRuleIds(ir(), [swap("+ [K_QUOTE] > U+2019")])]).toEqual(["r-quote"]);
  });

  it("a Shift-only difference is kept", () => {
    const ids = claimedInputRuleIds(ir(), [swap("+ [SHIFT K_QUOTE] > U+201D")]);
    expect([...ids]).toEqual(["r-shift-quote"]);
  });

  it("an S-01 with an NFD output still claims its key", () => {
    const ids = claimedInputRuleIds(ir(), [swap("+ [K_QUOTE] > U+0061 U+030C")]);
    expect(ids.has("r-quote")).toBe(true);
  });

  it("rules with preceding context, a deadkey or if() survive", () => {
    const contextual: IRRule[] = [
      rule("r-ctx", [{ kind: "char", value: "a" }, vkey("K_QUOTE")]),
      rule("r-dk", [{ kind: "deadkey", id: 1 }, vkey("K_QUOTE")]),
      rule("r-if", [{ kind: "if", store: "opt", value: "1" }, vkey("K_QUOTE")]),
    ];
    expect(claimedInputRuleIds(ir(contextual), [swap("+ [K_QUOTE] > U+2019")]).size).toBe(0);
  });

  it("removing the assignment restores the rule (nothing is stored)", () => {
    const start = ir();
    expect(claimedInputRuleIds(start, [swap("+ [K_QUOTE] > U+2019")]).size).toBe(1);
    expect(claimedInputRuleIds(start, []).size).toBe(0);
  });

  it("the S-02 trigger is claimed, and RALT trigger only with the altgr escape", () => {
    expect([...claimedInputRuleIds(ir(), [deadkey("K_COLON")])]).toEqual(["r-colon"]);
    expect([...claimedInputRuleIds(ir(), [deadkey("K_COLON", "double-tap space")])]).toEqual(["r-colon"]);
    const withAltgr = claimedInputRuleIds(ir(), [deadkey("K_COLON", "double-tap space altgr")]);
    expect([...withAltgr].sort()).toEqual(["r-colon", "r-ralt-colon"]);
  });

  it("the postfix mark key is claimed only while its bare escape is kept", () => {
    expect([...claimedInputRuleIds(ir(), [postfix("K_5", "bare")])]).toEqual(["r-5"]);
    expect(claimedInputRuleIds(ir(), [postfix("K_5", "")]).size).toBe(0);
  });

  it("a claim with no caps state also shadows the NCAPS and CAPS rules on that plane", () => {
    const capsRules = [
      rule("r-ncaps", [vkey("K_A", ["NCAPS"])]),
      rule("r-caps", [vkey("K_A", ["CAPS"])]),
      rule("r-shift-caps", [vkey("K_A", ["SHIFT", "CAPS"])]),
    ];
    const ids = claimedInputRuleIds(ir(capsRules), [swap("+ [K_A] > U+0101")]);
    expect([...ids].sort()).toEqual(["r-caps", "r-ncaps"]);
    // A claim that names a caps state shadows only that state.
    const ncapsOnly = claimedInputRuleIds(ir(capsRules), [swap("+ [NCAPS K_A] > U+0101")]);
    expect([...ncapsOnly]).toEqual(["r-ncaps"]);
  });

  it("chirality is exact: a RALT claim does not shadow an ALT rule", () => {
    const altRule = rule("r-alt", [vkey("K_E", ["ALT"])]);
    expect(claimedInputRuleIds(ir([altRule]), [swap("+ [RALT K_E] > U+00E9")]).size).toBe(0);
  });

  it("only group(main) is a candidate; touch assignments claim nothing", () => {
    const other = makeTestIR([group("main", []), group("extra", [QUOTE])]);
    expect(claimedInputRuleIds(other, [swap("+ [K_QUOTE] > U+2019")]).size).toBe(0);
    const touch: MechanismAssignment = { ...swap("+ [K_QUOTE] > U+2019"), modality: "touch" };
    expect(claimedInputRuleIds(ir(), [touch]).size).toBe(0);
  });

  it("an unknown modifier on the starting rule claims nothing", () => {
    const odd = rule("r-odd", [vkey("K_QUOTE", ["FUNKY"])]);
    expect(claimedInputRuleIds(ir([odd]), [swap("+ [K_QUOTE] > U+2019")]).size).toBe(0);
  });

  it("an assignment step 2 would skip claims nothing (unknown pattern, missing required slot)", () => {
    const unknown = assignment({ patternId: "no_such_pattern", strategyId: "S-01", slotValues: { kmnRules: "+ [K_QUOTE] > U+2019" } });
    expect(claimedInputRuleIds(ir(), [unknown]).size).toBe(0);
    const noTrigger = assignment({ patternId: "deadkey_single_tap", strategyId: "S-02", slotValues: { deadkeyName: "x" } });
    expect(claimedInputRuleIds(ir(), [noTrigger]).size).toBe(0);
    expect(claimedWith(ir(), [swap("+ [K_QUOTE] > U+2019")], () => undefined).size).toBe(0);
  });

  it("an S-08 claims every keystroke in its key list", () => {
    const ids = claimedInputRuleIds(ir(), [
      assignment({
        patternId: "modifier_as_layer_switch",
        strategyId: "S-08",
        slotValues: { altgrKeyList: "[RALT K_COLON] [RALT K_5]", altgrOutputList: "ab" },
      }),
    ]);
    expect([...ids]).toEqual(["r-ralt-colon"]);
  });
});
