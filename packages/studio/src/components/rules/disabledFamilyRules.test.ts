// Tests for disabledFamilyRuleIds (spec 082 FR-018): the pure helper behind
// "Disable group" enforcement — member rule nodeIds of disabled families,
// merged into the working-copy transform's deletion set.

import { describe, expect, it } from "vitest";
import type { IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { disabledFamilyRuleIds } from "./disabledFamilyRules.ts";
import { groupRules } from "./ruleFamilies.ts";

function rule(nodeId: string, storeRef: string, vkey: string): IRRule {
  return {
    nodeId,
    context: [
      { kind: "any", storeRef },
      { kind: "raw", text: "+" },
      { kind: "vkey", name: vkey, modifiers: [] },
    ],
    output: [{ kind: "raw", text: "context" }],
  };
}

function plainRule(nodeId: string, vkey: string, out: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers: [] }],
    output: [{ kind: "char", value: out }],
  };
}

function testIr(): KeyboardIR {
  return {
    origin: "scaffolded",
    header: {
      keyboardId: "t",
      name: "t",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: [
          rule("diablock-1", "diablock", "K_C"),
          rule("diablock-2", "diablock", "K_E"),
          plainRule("plain-1", "K_A", "a"),
        ],
      },
    ],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  } as unknown as KeyboardIR;
}

/** Family id of the family containing the given member rule. */
function familyIdOf(ir: KeyboardIR, memberNodeId: string): string {
  const rules = ir.groups.flatMap((g) => g.rules);
  const family = groupRules(rules).find((f) => f.memberIds.includes(memberNodeId));
  if (family === undefined) throw new Error(`no family for ${memberNodeId}`);
  return family.id;
}

describe("disabledFamilyRuleIds", () => {
  it("returns an empty set when the IR is null", () => {
    expect(disabledFamilyRuleIds(null, new Set(["any"])).size).toBe(0);
  });

  it("returns an empty set when no family is disabled", () => {
    expect(disabledFamilyRuleIds(testIr(), new Set()).size).toBe(0);
  });

  it("returns exactly the disabled family's member nodeIds", () => {
    const keyboard = testIr();
    const diablockFamily = familyIdOf(keyboard, "diablock-1");
    // Sanity: both guard rules group together, the plain rule does not.
    expect(familyIdOf(keyboard, "diablock-2")).toBe(diablockFamily);
    expect(familyIdOf(keyboard, "plain-1")).not.toBe(diablockFamily);

    const ids = disabledFamilyRuleIds(keyboard, new Set([diablockFamily]));
    expect([...ids].sort()).toEqual(["diablock-1", "diablock-2"]);
  });

  it("unions members across several disabled families", () => {
    const keyboard = testIr();
    const ids = disabledFamilyRuleIds(
      keyboard,
      new Set([familyIdOf(keyboard, "diablock-1"), familyIdOf(keyboard, "plain-1")]),
    );
    expect([...ids].sort()).toEqual(["diablock-1", "diablock-2", "plain-1"]);
  });

  it("ignores disabled ids that match no current family", () => {
    expect(disabledFamilyRuleIds(testIr(), new Set(["no-such-family"])).size).toBe(0);
  });
});
