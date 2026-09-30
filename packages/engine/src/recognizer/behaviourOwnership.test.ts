/**
 * T012 (spec 076 FR-021/FR-012): the Track 2 import recogniser lifts
 * `ownedByBehaviour` rules as behaviour-owned.
 *
 * - The marker ALONE determines behaviour ownership — no shape heuristics.
 * - Behaviour-owned rules pass through `recognizePatterns` with the marker
 *   intact, never gaining an `ownedByPattern` stamp (FR-002 mutual
 *   exclusivity), never treated as author content or carve targets.
 * - Both-markers conflict (invalid per FR-002): the behaviour marker wins
 *   candidacy deterministically; a dangling `ownedByPattern` stamp still trips
 *   the pre-existing ownership-drift invariant (fail-fast, not silent).
 */
import { describe, it, expect } from "vitest";
import { recognizePatterns } from "./index.js";
import type { IRGroup, IRRule } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";

const BEHAVIOUR = "carve-suppression";

function vkeyRule(
  nodeId: string,
  keyName: string,
  output: IRRule["output"],
  extra?: Partial<IRRule>,
): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: keyName, modifiers: [] }],
    output,
    ...extra,
  };
}

function groupWith(nodeId: string, rules: IRRule[]): IRGroup {
  return { nodeId, name: "main", usingKeys: true, readonly: false, rules };
}

describe("recognizePatterns lifts ownedByBehaviour rules as behaviour-owned (FR-021)", () => {
  it("a suppression-owned rule round-trips with marker intact and no ownedByPattern", () => {
    const rule = vkeyRule("rule#0", "K_X", [{ kind: "nul" }], {
      ownedByBehaviour: BEHAVIOUR,
    });
    const ir = makeTestIR([groupWith("group#0", [rule])]);

    const { ir: out } = recognizePatterns(ir);

    const outRule = out.groups[0]!.rules[0]!;
    expect(outRule.ownedByBehaviour).toBe(BEHAVIOUR);
    expect(outRule.ownedByPattern).toBeUndefined();
    // No pattern claims it.
    for (const pattern of out.recognizedPatterns) {
      expect(
        pattern.ownedNodes?.some((n) => n.kind === "rule" && n.nodeId === "rule#0"),
      ).toBe(false);
    }
  });

  it("marker alone decides: a behaviour-owned rule with S-01 shape is NOT pattern-lifted", () => {
    // `+ [K_Q] > "x"` is exactly the S-01 simple-swap shape — without the
    // marker it would be claimed. With the marker, shape must not matter.
    const owned = vkeyRule("rule#owned", "K_Q", [{ kind: "char", value: "x" }], {
      ownedByBehaviour: BEHAVIOUR,
    });
    const plain = vkeyRule("rule#plain", "K_W", [{ kind: "char", value: "y" }]);
    const ir = makeTestIR([groupWith("group#0", [owned, plain])]);

    const { ir: out } = recognizePatterns(ir);

    const outOwned = out.groups[0]!.rules.find((r) => r.nodeId === "rule#owned")!;
    const outPlain = out.groups[0]!.rules.find((r) => r.nodeId === "rule#plain")!;
    expect(outOwned.ownedByBehaviour).toBe(BEHAVIOUR);
    expect(outOwned.ownedByPattern).toBeUndefined();
    // The unmarked S-01-shaped sibling is still recognized normally.
    expect(outPlain.ownedByPattern).toBeDefined();
    expect(outPlain.ownedByBehaviour).toBeUndefined();
  });

  it("a behaviour-owned guard rule (any(store) context, context output) is not pattern-matched", () => {
    const guard: IRRule = {
      nodeId: "rule#guard",
      context: [
        { kind: "any", storeRef: "s" },
        { kind: "vkey", name: "K_X", modifiers: [] },
      ],
      output: [{ kind: "context", offset: 0 }],
      ownedByBehaviour: BEHAVIOUR,
    };
    const ir = makeTestIR([groupWith("group#0", [guard])]);

    const { ir: out } = recognizePatterns(ir);

    const outGuard = out.groups[0]!.rules[0]!;
    expect(outGuard.ownedByBehaviour).toBe(BEHAVIOUR);
    expect(outGuard.ownedByPattern).toBeUndefined();
    expect(out.recognizedPatterns).toHaveLength(0);
  });

  it("both markers: deterministic — behaviour wins candidacy; dangling pattern stamp still throws", () => {
    const conflicted = vkeyRule("rule#0", "K_Q", [{ kind: "char", value: "x" }], {
      ownedByBehaviour: BEHAVIOUR,
      // Invalid per FR-002 (zod rejects it at validation boundaries). The
      // behaviour marker wins candidacy (no matcher claims the rule — asserted
      // by the throw below happening in assertOwnershipConsistency, not in a
      // matcher), while the pre-existing ownership invariant stays
      // authoritative for the dangling `ownedByPattern` stamp itself.
      ownedByPattern: "some-pattern",
    });
    const ir = makeTestIR([groupWith("group#0", [conflicted])]);

    expect(() => recognizePatterns(ir)).toThrow(/Ownership drift/);
    // The rule was never claimed by a matcher: no pattern was lifted.
    expect(ir.recognizedPatterns).toHaveLength(0);
    // And the behaviour marker was preserved, not stripped or overwritten.
    expect(ir.groups[0]!.rules[0]!.ownedByBehaviour).toBe(BEHAVIOUR);
  });

  it("the recogniser never authors content: rules pass through unchanged except pattern stamps", () => {
    const owned = vkeyRule("rule#owned", "K_X", [{ kind: "nul" }], {
      ownedByBehaviour: BEHAVIOUR,
    });
    const plain = vkeyRule("rule#plain", "K_Q", [{ kind: "char", value: "ɛ" }]);
    const before = JSON.parse(JSON.stringify([owned, plain]));
    const ir = makeTestIR([groupWith("group#0", [owned, plain])]);

    const { ir: out } = recognizePatterns(ir);

    // Same rules, same order, no additions/removals.
    expect(out.groups[0]!.rules.map((r) => r.nodeId)).toEqual([
      "rule#owned",
      "rule#plain",
    ]);
    // The behaviour-owned rule is byte-identical to before recognition.
    expect(out.groups[0]!.rules[0]).toEqual(before[0]);
    // The plain rule gained only the ownedByPattern stamp.
    const { ownedByPattern, ...plainRest } = out.groups[0]!.rules[1] as IRRule & {
      ownedByPattern?: string;
    };
    expect(ownedByPattern).toBeDefined();
    expect(plainRest).toEqual(before[1]);
  });

  it("recognizedRatio counts pattern-covered rules only; behaviour-owned rules are not pattern-covered", () => {
    const owned = vkeyRule("rule#owned", "K_X", [{ kind: "nul" }], {
      ownedByBehaviour: BEHAVIOUR,
    });
    const plain = vkeyRule("rule#plain", "K_Q", [{ kind: "char", value: "ɛ" }]);
    const ir = makeTestIR([groupWith("group#0", [owned, plain])]);

    const { recognizedRatio } = recognizePatterns(ir);

    // 1 of 2 rules pattern-covered; the behaviour-owned rule is recognized as
    // behaviour-owned (marker round-trips) but is not pattern coverage.
    expect(recognizedRatio).toBe(0.5);
  });
});
