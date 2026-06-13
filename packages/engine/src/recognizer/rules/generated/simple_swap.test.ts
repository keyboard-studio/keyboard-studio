// Round-trip test: generated simple_swap rule vs hand-written s01Recognizer.
// For each IR fixture: run both rules, compare ownedNodes and the
// keystrokeCharacterMap slot value.  PatternId bases are compared before '#'
// because the two implementations use different id strings ("simple_swap" vs
// "simple-swap").
import { describe, it, expect } from "vitest";
import { rule as generatedSimpleSwap } from "./simple_swap.js";
import { s01Recognizer } from "../s01-simple-swap.js";
import type { IRGroup } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";

function baseId(patternId: string): string {
  return patternId.split("#")[0] ?? patternId;
}

function suffixId(patternId: string): string {
  return patternId.split("#")[1] ?? "";
}

// ---------------------------------------------------------------------------
// Shared IR builders (same fixtures as s01-simple-swap.test.ts)
// ---------------------------------------------------------------------------

function s01Rule(
  nodeId: string,
  vkey: string,
  modifiers: string[],
  charOut: string,
): import("@keyboard-studio/contracts").IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers }],
    output: [{ kind: "char", value: charOut }],
  };
}

function makeIR(groups: IRGroup[]) {
  return makeTestIR(groups);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortedNodeIds(matches: import("../../types.js").MatchResult[]): string[][] {
  return matches.map((m) => [...m.ownedNodes.map((n) => n.nodeId)].sort());
}

// ---------------------------------------------------------------------------
// Round-trip tests
// ---------------------------------------------------------------------------

describe("generated/simple_swap round-trip vs s01Recognizer", () => {
  it("3 S-01 rules in one group: both rules produce 1 match with 3 ownedNodes and matching slot", () => {
    const group: IRGroup = {
      nodeId: "group#0",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        s01Rule("rule#0", "K_Q", [], "ɛ"),
        s01Rule("rule#1", "K_Q", ["SHIFT"], "Ɛ"),
        s01Rule("rule#2", "K_C", [], "ɔ"),
      ],
    };
    const ir = makeIR([group]);

    const refMatches = s01Recognizer.match(ir);
    const genMatches = generatedSimpleSwap.match(ir);

    // Both produce exactly 1 match
    expect(refMatches).toHaveLength(1);
    expect(genMatches).toHaveLength(1);

    const ref = refMatches[0]!;
    const gen = genMatches[0]!;

    // patternId suffix (group name) must agree; bases may differ by naming convention
    expect(suffixId(gen.patternId)).toBe(suffixId(ref.patternId));

    // ownedNodes set must be identical
    expect([...gen.ownedNodes.map((n) => n.nodeId)].sort()).toEqual(
      [...ref.ownedNodes.map((n) => n.nodeId)].sort(),
    );

    // The primary slot both rules agree on
    expect(gen.slotValues["keystrokeCharacterMap"]).toBe(
      ref.slotValues["keystrokeCharacterMap"],
    );
  });

  it("mixed group (1 S-01 + 1 deadkey-output): both rules own only the S-01 rule", () => {
    const group: IRGroup = {
      nodeId: "group#0",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        s01Rule("rule#0", "K_Q", [], "ɛ"),
        {
          nodeId: "rule#1",
          context: [{ kind: "vkey", name: "K_2", modifiers: ["RALT"] }],
          output: [{ kind: "deadkey", id: 0x007e }],
        },
      ],
    };
    const ir = makeIR([group]);

    const refMatches = s01Recognizer.match(ir);
    const genMatches = generatedSimpleSwap.match(ir);

    expect(refMatches).toHaveLength(1);
    expect(genMatches).toHaveLength(1);

    const ref = refMatches[0]!;
    const gen = genMatches[0]!;

    // Only rule#0 is owned
    expect(gen.ownedNodes).toHaveLength(1);
    expect(gen.ownedNodes[0]!.nodeId).toBe("rule#0");
    expect(ref.ownedNodes[0]!.nodeId).toBe("rule#0");

    expect(gen.slotValues["keystrokeCharacterMap"]).toBe(
      ref.slotValues["keystrokeCharacterMap"],
    );
  });

  it("two non-deadkey groups: both rules produce 2 matches with matching group suffixes", () => {
    const groupA: IRGroup = {
      nodeId: "group#0",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [s01Rule("rule#0", "K_Q", [], "ɛ")],
    };
    const groupB: IRGroup = {
      nodeId: "group#1",
      name: "shift",
      usingKeys: true,
      readonly: false,
      rules: [s01Rule("rule#1", "K_Q", ["SHIFT"], "Ɛ")],
    };
    const ir = makeIR([groupA, groupB]);

    const refMatches = s01Recognizer.match(ir);
    const genMatches = generatedSimpleSwap.match(ir);

    expect(refMatches).toHaveLength(2);
    expect(genMatches).toHaveLength(2);

    const refSuffixes = refMatches.map((m) => suffixId(m.patternId)).sort();
    const genSuffixes = genMatches.map((m) => suffixId(m.patternId)).sort();
    expect(genSuffixes).toEqual(refSuffixes);

    // ownedNodes sets per group must match
    expect(sortedNodeIds(genMatches)).toEqual(sortedNodeIds(refMatches));
  });

  it("RAlt variant counts as S-01: both rules recognize it", () => {
    const group: IRGroup = {
      nodeId: "group#0",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [s01Rule("rule#0", "K_E", ["RALT"], "€")],
    };
    const ir = makeIR([group]);

    const refMatches = s01Recognizer.match(ir);
    const genMatches = generatedSimpleSwap.match(ir);

    expect(refMatches).toHaveLength(1);
    expect(genMatches).toHaveLength(1);

    const ref = refMatches[0]!;
    const gen = genMatches[0]!;

    expect(gen.slotValues["keystrokeCharacterMap"]).toBe(
      ref.slotValues["keystrokeCharacterMap"],
    );
  });

  // --- Negative tests ---

  it("rules in a deadkeys (usingKeys=false) group: both rules return zero matches", () => {
    const group: IRGroup = {
      nodeId: "group#1",
      name: "deadkeys",
      usingKeys: false,
      readonly: false,
      rules: [s01Rule("rule#0", "K_Q", [], "ɛ")],
    };
    const ir = makeIR([group]);

    expect(s01Recognizer.match(ir)).toHaveLength(0);
    expect(generatedSimpleSwap.match(ir)).toHaveLength(0);
  });

  it("more than 5 distinct base chars: both rules skip the group (>5 limit)", () => {
    const group: IRGroup = {
      nodeId: "group#0",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        s01Rule("rule#0", "K_Q", [], "ɛ"),
        s01Rule("rule#1", "K_W", [], "ɔ"),
        s01Rule("rule#2", "K_E", [], "ŋ"),
        s01Rule("rule#3", "K_R", [], "ʃ"),
        s01Rule("rule#4", "K_T", [], "ʒ"),
        s01Rule("rule#5", "K_Y", [], "ɓ"), // 6th distinct key — over limit
      ],
    };
    const ir = makeIR([group]);

    expect(s01Recognizer.match(ir)).toHaveLength(0);
    expect(generatedSimpleSwap.match(ir)).toHaveLength(0);
  });

  it("empty groups array: both rules return zero matches", () => {
    const ir = makeIR([]);
    expect(s01Recognizer.match(ir)).toHaveLength(0);
    expect(generatedSimpleSwap.match(ir)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// lift() smoke tests (generated rule)
// ---------------------------------------------------------------------------

describe("generated/simple_swap lift()", () => {
  it("lift returns a Pattern with origin=recognized and strategyId=S-01", () => {
    const match = {
      patternId: "simple_swap#main",
      ownedNodes: [{ kind: "rule" as const, nodeId: "rule#0" }],
      slotValues: { keystrokeCharacterMap: "+ [K_Q] > U+025B" },
    };
    const pattern = generatedSimpleSwap.lift(match);
    expect(pattern.origin).toBe("recognized");
    expect(pattern.strategyId).toBe("S-01");
    // keystrokeCharacterMap slot value is surfaced in questions
    const q = pattern.questions.find((q) => q.id === "keystrokeCharacterMap");
    expect(q).toBeDefined();
    expect(q!.default).toBe("+ [K_Q] > U+025B");
  });
});
