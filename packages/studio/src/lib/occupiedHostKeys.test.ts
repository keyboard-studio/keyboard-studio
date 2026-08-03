// occupiedHostKeys tests (spec 055 T009 / research D-05).
//
// Locks the two structural IRRule shapes this module bridges into
// extractMechanismHostKey (simple_swap / deadkey_single_tap), the
// no-host-key-means-no-contribution rule, the empty-IR case, and purity
// (determinism + no mutation of the input).

import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRGroup, IRRule } from "@keyboard-studio/contracts";
import { occupiedHostKeys } from "./occupiedHostKeys.js";

// ---------------------------------------------------------------------------
// Fixture helpers (mirrors the idiom in deriveDesktopModifications.test.ts)
// ---------------------------------------------------------------------------

function makeGroup(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

function makeVkeyRule(
  nodeId: string,
  vkey: string,
  modifiers: string[],
  outputChar: string,
): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers }],
    output: [{ kind: "char", value: outputChar }],
  };
}

function makeDeadkeyRule(
  nodeId: string,
  deadkeyId: number,
  baseChar: string,
  outputChar: string,
): IRRule {
  return {
    nodeId,
    context: [
      { kind: "deadkey", id: deadkeyId },
      { kind: "char", value: baseChar },
    ],
    output: [{ kind: "char", value: outputChar }],
  };
}

describe("occupiedHostKeys", () => {
  it("collects the host key for each simple_swap-shaped (single vkey -> single char) rule", () => {
    const group = makeGroup("group#main", "main", [
      makeVkeyRule("rule#0", "K_A", [], "a"),
      makeVkeyRule("rule#1", "K_Q", [], "q"),
      makeVkeyRule("rule#2", "K_Q", ["SHIFT"], "Q"),
    ]);
    const ir = makeTestIR([group]);

    const result = occupiedHostKeys(ir);

    // K_Q occupied by both an unshifted and a shifted rule collapses to one entry.
    expect(result).toEqual(new Set(["K_A", "K_Q"]));
  });

  it("collects the host key for a deadkey_single_tap-shaped rule (deadkey marker + base-letter char)", () => {
    const group = makeGroup("group#main", "main", [
      makeDeadkeyRule("rule#0", 1, "a", "á"),
    ]);
    const ir = makeTestIR([group]);

    const result = occupiedHostKeys(ir);

    expect(result).toEqual(new Set(["K_A"]));
  });

  it("an assignment whose mechanism yields no host key contributes nothing — never an empty-string key", () => {
    // Deadkey-shaped rule whose base char is not a letter: extractMechanismHostKey's
    // deadkey_single_tap branch recognizes the shape but returns hostKey: "".
    const group = makeGroup("group#main", "main", [
      makeDeadkeyRule("rule#0", 1, "5", "⁵"),
    ]);
    const ir = makeTestIR([group]);

    const result = occupiedHostKeys(ir);

    expect(result.has("")).toBe(false);
    expect(result.size).toBe(0);
  });

  it("a rule matching neither recognized shape contributes nothing", () => {
    // Two vkey context elements (not the single-vkey simple_swap shape) and
    // not a deadkey-marker shape either.
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [
        { kind: "vkey", name: "K_LCONTROL", modifiers: [] },
        { kind: "vkey", name: "K_A", modifiers: [] },
      ],
      output: [{ kind: "char", value: "a" }],
    };
    const group = makeGroup("group#main", "main", [rule]);
    const ir = makeTestIR([group]);

    const result = occupiedHostKeys(ir);

    expect(result.size).toBe(0);
  });

  it("an IR with no groups/rules yields an empty set", () => {
    const ir = makeTestIR([]);

    const result = occupiedHostKeys(ir);

    expect(result.size).toBe(0);
    expect(result).toEqual(new Set());
  });

  it("is deterministic and does not mutate the input IR", () => {
    const group = makeGroup("group#main", "main", [
      makeVkeyRule("rule#0", "K_A", [], "a"),
      makeDeadkeyRule("rule#1", 1, "e", "é"),
    ]);
    const ir = makeTestIR([group]);
    const before = JSON.parse(JSON.stringify(ir)) as unknown;

    const first = occupiedHostKeys(ir);
    const second = occupiedHostKeys(ir);

    expect(first).toEqual(second);
    expect(first).toEqual(new Set(["K_A", "K_E"]));
    expect(JSON.parse(JSON.stringify(ir))).toEqual(before);
  });
});
