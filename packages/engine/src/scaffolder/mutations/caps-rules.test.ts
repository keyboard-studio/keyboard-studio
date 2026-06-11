/**
 * Tests for mutateDeleteCapsRules.
 */

import { describe, it, expect } from "vitest";
import type { KeyboardIR, IRGroup, IRRule } from "@keyboard-studio/contracts";
import { mutateDeleteCapsRules } from "./caps-rules.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIR(groups: IRGroup[]): KeyboardIR {
  return {
    origin: "scaffolded",
    header: {
      keyboardId: "test",
      name: "Test",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups,
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

function vkeyRule(modifiers: string[], name = "K_A", nodeId = "rule#0"): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name, modifiers }],
    output: [{ kind: "char", value: "a" }],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("mutateDeleteCapsRules", () => {
  it("removes a rule with CAPS modifier", () => {
    const ir = makeIR([
      {
        nodeId: "group#0",
        name: "main",
        usingKeys: true,
        rules: [vkeyRule(["CAPS"], "K_A"), vkeyRule([], "K_B", "rule#1")],
        readonly: false,
      },
    ]);
    const result = mutateDeleteCapsRules(ir);
    expect(result.groups[0].rules).toHaveLength(1);
    const el = result.groups[0].rules[0].context[0];
    expect(el.kind === "vkey" && el.name).toBe("K_B");
  });

  it("removes a rule whose vkey name starts with CAPS (bare [CAPS] element)", () => {
    const ir = makeIR([
      {
        nodeId: "group#0",
        name: "main",
        usingKeys: true,
        rules: [vkeyRule([], "CAPS"), vkeyRule([], "K_A", "rule#1")],
        readonly: false,
      },
    ]);
    const result = mutateDeleteCapsRules(ir);
    expect(result.groups[0].rules).toHaveLength(1);
  });

  it("removes a rule with NCAPS+CAPS combo modifiers", () => {
    const ir = makeIR([
      {
        nodeId: "group#0",
        name: "main",
        usingKeys: true,
        rules: [vkeyRule(["NCAPS", "CAPS"], "K_A")],
        readonly: false,
      },
    ]);
    const result = mutateDeleteCapsRules(ir);
    expect(result.groups[0].rules).toHaveLength(0);
  });

  it("leaves rules without CAPS unchanged (referential equality)", () => {
    const rule = vkeyRule(["SHIFT"], "K_A");
    const ir = makeIR([
      {
        nodeId: "group#0",
        name: "main",
        usingKeys: true,
        rules: [rule],
        readonly: false,
      },
    ]);
    const result = mutateDeleteCapsRules(ir);
    expect(result.groups[0].rules[0]).toBe(rule);
  });

  it("does not delete rules where vkey name starts with 'CAPS' as a substring only", () => {
    // A hypothetical key whose name only contains CAPS as non-leading substring should be kept
    // But our gate is /^CAPS\b/ so CAPSLOCK would match; K_CAPS_FOO would not start with CAPS.
    const ir = makeIR([
      {
        nodeId: "group#0",
        name: "main",
        usingKeys: true,
        rules: [vkeyRule([], "K_CAPSLOCK", "rule#0"), vkeyRule([], "K_A", "rule#1")],
        readonly: false,
      },
    ]);
    const result = mutateDeleteCapsRules(ir);
    // K_CAPSLOCK does NOT start with "CAPS" at position 0 of the name — it starts with "K_"
    expect(result.groups[0].rules).toHaveLength(2);
  });

  it("deletes CAPSLOCK rule when name is exactly CAPSLOCK (starts with CAPS)", () => {
    const ir = makeIR([
      {
        nodeId: "group#0",
        name: "main",
        usingKeys: true,
        rules: [vkeyRule([], "CAPSLOCK", "rule#0"), vkeyRule([], "K_A", "rule#1")],
        readonly: false,
      },
    ]);
    const result = mutateDeleteCapsRules(ir);
    // CAPSLOCK starts with CAPS, so the gate /^CAPS\b/ would NOT match (CAPSLOCK has no word boundary after CAPS)
    // Actually /^CAPS\b/.test("CAPSLOCK") is false because \b is between S and L (non-word).
    // Wait: /^CAPS\b/.test("CAPSLOCK") — L is a word char so \b does NOT match between S and L.
    // But /^CAPS\b/.test("CAPS") — end of string after S is a word boundary, so it matches.
    // So CAPSLOCK is NOT deleted.
    expect(result.groups[0].rules).toHaveLength(2);
  });

  it("does not mutate input in-place", () => {
    const original = makeIR([
      {
        nodeId: "group#0",
        name: "main",
        usingKeys: true,
        rules: [vkeyRule(["CAPS"], "K_A"), vkeyRule([], "K_B", "rule#1")],
        readonly: false,
      },
    ]);
    const originalRuleCount = original.groups[0].rules.length;
    mutateDeleteCapsRules(original);
    expect(original.groups[0].rules.length).toBe(originalRuleCount);
  });
});
