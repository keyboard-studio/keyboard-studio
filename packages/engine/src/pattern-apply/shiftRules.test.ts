import { describe, it, expect } from "vitest";
import type { IRGroup, IRRule, IRStore } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import {
  isMnemonicLayout,
  keyHasCapsHandling,
  buildShiftRuleLines,
  buildBaseRuleLines,
  buildCasePairRuleLines,
  planShiftAssignment,
} from "./shiftRules.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function mnemonicStore(value: string): IRStore {
  return {
    nodeId: "s1",
    name: "MNEMONICLAYOUT",
    items: [{ kind: "char", value }],
    isSystem: true,
  };
}

function vkeyRule(vkeyName: string, modifiers: string[], outputChar: string): IRRule {
  return {
    nodeId: `r-${vkeyName}-${modifiers.join("_")}`,
    context: [{ kind: "vkey", name: vkeyName, modifiers }],
    output: [{ kind: "char", value: outputChar }],
  };
}

function mainGroup(rules: IRRule[]): IRGroup {
  return {
    nodeId: "g-main",
    name: "main",
    usingKeys: true,
    rules,
    readonly: false,
  };
}

// ---------------------------------------------------------------------------
// isMnemonicLayout
// ---------------------------------------------------------------------------

describe("isMnemonicLayout", () => {
  it("returns true when &mnemoniclayout store is \"1\"", () => {
    const ir = makeTestIR([mainGroup([])], [mnemonicStore("1")]);
    expect(isMnemonicLayout(ir)).toBe(true);
  });

  it("returns false when &mnemoniclayout store is \"0\"", () => {
    const ir = makeTestIR([mainGroup([])], [mnemonicStore("0")]);
    expect(isMnemonicLayout(ir)).toBe(false);
  });

  it("returns false when &mnemoniclayout store is absent", () => {
    const ir = makeTestIR([mainGroup([])], []);
    expect(isMnemonicLayout(ir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// keyHasCapsHandling
// ---------------------------------------------------------------------------

describe("keyHasCapsHandling", () => {
  it("returns true when the key has an explicit CAPS rule", () => {
    const ir = makeTestIR([
      mainGroup([vkeyRule("K_A", ["CAPS"], "A")]),
    ]);
    expect(keyHasCapsHandling(ir, "main", "K_A")).toBe(true);
  });

  it("returns true when the key has an explicit NCAPS rule", () => {
    const ir = makeTestIR([
      mainGroup([vkeyRule("K_A", ["NCAPS"], "a")]),
    ]);
    expect(keyHasCapsHandling(ir, "main", "K_A")).toBe(true);
  });

  it("returns false when the key has no CAPS/NCAPS rule", () => {
    const ir = makeTestIR([
      mainGroup([vkeyRule("K_A", [], "a"), vkeyRule("K_A", ["SHIFT"], "A")]),
    ]);
    expect(keyHasCapsHandling(ir, "main", "K_A")).toBe(false);
  });

  it("returns false for a different key with CAPS handling (does not leak across keys)", () => {
    const ir = makeTestIR([
      mainGroup([vkeyRule("K_B", ["CAPS"], "B")]),
    ]);
    expect(keyHasCapsHandling(ir, "main", "K_A")).toBe(false);
  });

  it("returns false when the named group does not exist", () => {
    const ir = makeTestIR([mainGroup([vkeyRule("K_A", ["CAPS"], "A")])]);
    expect(keyHasCapsHandling(ir, "deadkeys", "K_A")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildShiftRuleLines
// ---------------------------------------------------------------------------

describe("buildShiftRuleLines", () => {
  it("emits a single SHIFT line when there is no CAPS handling", () => {
    expect(buildShiftRuleLines("K_A", "Θ", { capsHandling: false })).toEqual([
      "+ [SHIFT K_A] > U+0398",
    ]);
  });

  it("emits NCAPS + CAPS lines when CAPS handling is present", () => {
    expect(buildShiftRuleLines("K_A", "Θ", { capsHandling: true })).toEqual([
      "+ [NCAPS SHIFT K_A] > U+0398",
      "+ [CAPS SHIFT K_A] > U+0398",
    ]);
  });

  it("pads short codepoints to 4 hex digits", () => {
    expect(buildShiftRuleLines("K_B", "é", { capsHandling: false })).toEqual([
      "+ [SHIFT K_B] > U+00E9",
    ]);
  });
});

// ---------------------------------------------------------------------------
// buildBaseRuleLines
// ---------------------------------------------------------------------------

describe("buildBaseRuleLines", () => {
  it("emits a single bare line when there is no CAPS handling", () => {
    expect(buildBaseRuleLines("K_A", "θ", { capsHandling: false })).toEqual([
      "+ [K_A] > U+03B8",
    ]);
  });

  it("emits the NCAPS+CAPS pair (same output both states) when CAPS handling is present", () => {
    expect(buildBaseRuleLines("K_A", "θ", { capsHandling: true })).toEqual([
      "+ [NCAPS K_A] > U+03B8",
      "+ [CAPS K_A] > U+03B8",
    ]);
  });
});

// ---------------------------------------------------------------------------
// buildCasePairRuleLines
// ---------------------------------------------------------------------------

describe("buildCasePairRuleLines", () => {
  it("emits the base+shift pair (no CAPS/NCAPS) when there is no CAPS handling", () => {
    expect(
      buildCasePairRuleLines("K_A", "θ", "Θ", { capsHandling: false }),
    ).toEqual(["+ [K_A] > U+03B8", "+ [SHIFT K_A] > U+0398"]);
  });

  it("emits the full CAPS-as-case-inverter quad when CAPS handling is present", () => {
    expect(
      buildCasePairRuleLines("K_A", "θ", "Θ", { capsHandling: true }),
    ).toEqual([
      "+ [NCAPS K_A] > U+03B8",
      "+ [NCAPS SHIFT K_A] > U+0398",
      "+ [CAPS K_A] > U+0398",
      "+ [CAPS SHIFT K_A] > U+03B8",
    ]);
  });
});

// ---------------------------------------------------------------------------
// planShiftAssignment
// ---------------------------------------------------------------------------

describe("planShiftAssignment", () => {
  it("disallows with reason 'mnemonic' for a mnemonic keyboard", () => {
    const ir = makeTestIR([mainGroup([])], [mnemonicStore("1")]);
    expect(planShiftAssignment(ir, "main", "K_A")).toEqual({
      allowed: false,
      reason: "mnemonic",
      capsHandling: false,
    });
  });

  it("allows and reports capsHandling for a non-mnemonic keyboard", () => {
    const ir = makeTestIR([mainGroup([vkeyRule("K_A", ["CAPS"], "A")])]);
    expect(planShiftAssignment(ir, "main", "K_A")).toEqual({
      allowed: true,
      capsHandling: true,
    });
  });
});
