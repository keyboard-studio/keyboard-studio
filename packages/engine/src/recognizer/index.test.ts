import { describe, it, expect } from "vitest";
import { recognizePatterns } from "./index.js";
import { s01Recognizer } from "./rules/s01-simple-swap.js";
import type { IRGroup, IRRule, IRStore } from "@keyboard-studio/contracts";
import { makeTestIR, charItems } from "@keyboard-studio/contracts/fixtures";
import type { RecognizerRule } from "./types.js";

describe("recognizePatterns", () => {
  it("empty IR (no groups) returns empty recognizedPatterns and recognizedRatio 0", () => {
    const ir = makeTestIR([]);
    const { ir: out, recognizedRatio } = recognizePatterns(ir);
    expect(out.recognizedPatterns).toHaveLength(0);
    // 0/0 => 0 per spec (no rules means nothing to recognize)
    expect(recognizedRatio).toBe(0);
  });

  it("IR with one group and no matching rules leaves recognizedPatterns empty", () => {
    const group: IRGroup = {
      nodeId: "group#0",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#0",
          // two-element context: not S-01
          context: [
            { kind: "char", value: "a" },
            { kind: "vkey", name: "K_A", modifiers: [] },
          ],
          output: [{ kind: "char", value: "b" }],
        },
      ],
    };
    const ir = makeTestIR([group]);
    const { ir: out, recognizedRatio } = recognizePatterns(ir);
    expect(out.recognizedPatterns).toHaveLength(0);
    expect(recognizedRatio).toBe(0);
  });

  it("IR with one S-01 rule produces one Pattern with ownedNodes and ownedByPattern set", () => {
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "vkey", name: "K_Q", modifiers: [] }],
      output: [{ kind: "char", value: "ɛ" }],
    };
    const group: IRGroup = {
      nodeId: "group#0",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [rule],
    };
    const ir = makeTestIR([group]);
    const { ir: out, recognizedRatio } = recognizePatterns(ir);

    expect(out.recognizedPatterns).toHaveLength(1);
    const pattern = out.recognizedPatterns[0]!;
    expect(pattern.origin).toBe("recognized");
    expect(pattern.ownedNodes).toHaveLength(1);
    expect(pattern.ownedNodes?.[0]?.nodeId).toBe("rule#0");

    // ownedByPattern must be set on the covered rule (disambiguated id)
    expect(out.groups[0]!.rules[0]!.ownedByPattern).toBe("simple-swap#main");
    expect(recognizedRatio).toBe(1);
  });

  it("calling recognizePatterns twice does not duplicate patterns or change the ratio", () => {
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "vkey", name: "K_Q", modifiers: [] }],
      output: [{ kind: "char", value: "ɛ" }],
    };
    const group: IRGroup = {
      nodeId: "group#0",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [rule],
    };
    const ir = makeTestIR([group]);

    const { recognizedRatio: ratio1 } = recognizePatterns(ir);
    expect(ir.recognizedPatterns).toHaveLength(1);

    const { recognizedRatio: ratio2 } = recognizePatterns(ir);
    // Second call must not push more patterns
    expect(ir.recognizedPatterns).toHaveLength(1);
    // Ratio must be identical
    expect(ratio2).toBe(ratio1);
  });

  it("does not duplicate Patterns when a hand-written and a YAML-generated rule both match a cluster", () => {
    // Regression lock for the double-match concern: an S-02 grave-deadkey cluster
    // (with an escape rule) is matchable by BOTH s02Recognizer (hand-written) and
    // the YAML-generated deadkeySingleTapRule. They do not produce duplicate
    // Patterns because s02Recognizer runs first in DEFAULT_RULES and stamps
    // ownedByPattern, and the generated rule's interpreter skips already-owned
    // nodes (interpreter.ts ownedByPattern guards). This test pins that behavior
    // so a future rule reorder / new generated rule can't silently reintroduce
    // the duplicate. Expect exactly one Pattern.
    const triggerNodeId = "rule#trigger-0060";
    const bodyNodeId = "rule#body-0060";
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: triggerNodeId,
          context: [{ kind: "vkey", name: "K_7", modifiers: ["RALT"] }],
          output: [{ kind: "deadkey", id: 0x0060 }],
        },
      ],
    };
    const deadkeysGroup: IRGroup = {
      nodeId: "group#deadkeys",
      name: "deadkeys",
      usingKeys: false,
      readonly: false,
      rules: [
        {
          nodeId: bodyNodeId,
          context: [
            { kind: "deadkey", id: 0x0060 },
            { kind: "any", storeRef: "dkf0060" },
          ],
          output: [{ kind: "index", storeRef: "dkt0060", offset: 2 }],
        },
        {
          // Escape rule: dk(0x0060) + K_7 -> '`' (bare accent). The generated
          // deadkeySingleTapRule requires an escape rule to match; including it
          // makes BOTH the hand-written and generated S-02 rules fire on this
          // cluster — the duplicate-match condition.
          nodeId: "rule#escape-0060",
          context: [
            { kind: "deadkey", id: 0x0060 },
            { kind: "vkey", name: "K_7", modifiers: [] },
          ],
          output: [{ kind: "char", value: "`" }],
        },
      ],
    };
    const stores: IRStore[] = [
      { nodeId: "store#dkf0060", name: "dkf0060", items: charItems(" aAeEiIoOuU"), isSystem: false },
      { nodeId: "store#dkt0060", name: "dkt0060", items: charItems("`àÀèÈìÌòÒùÙ"), isSystem: false },
    ];
    const ir = makeTestIR([mainGroup, deadkeysGroup], stores);

    const { ir: out } = recognizePatterns(ir);

    // Exactly one Pattern — the generated rule's overlapping re-match is dropped.
    expect(out.recognizedPatterns).toHaveLength(1);
    // Every owned rule resolves to that single surviving pattern (no last-write
    // -wins split between two duplicate Patterns).
    const ownedIds = new Set(
      out.groups
        .flatMap((g) => g.rules)
        .map((r) => r.ownedByPattern)
        .filter((p): p is string => p !== undefined),
    );
    expect(ownedIds.size).toBe(1);
    expect(ownedIds.has(out.recognizedPatterns[0]!.id)).toBe(true);
  });

  it("does not re-claim an S-01-shaped rule already owned by an earlier recognizer pass in the same run (double-claim regression, #886)", () => {
    // Two S-01-shaped rules in the same group, run through the REAL
    // recognizePatterns() pipeline with a synthetic "earlier" RecognizerRule
    // that claims the first rule before s01Recognizer gets a turn — mirroring
    // how S-02 (or any rule ordered before S-01 in DEFAULT_RULES) can claim a
    // node that also matches S-01's shape. Before the #886 fix,
    // s01Recognizer.match() had no ownedByPattern guard and would re-lift the
    // already-claimed rule into a SECOND Pattern — the "ghost chip": the group
    // Inspector and the owning pattern's Inspector would then disagree about
    // who owns the rule.
    const claimedNodeId = "rule#claimed-0";
    const unclaimedNodeId = "rule#unclaimed-0";
    const group: IRGroup = {
      nodeId: "group#0",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: claimedNodeId,
          context: [{ kind: "vkey", name: "K_Q", modifiers: [] }],
          output: [{ kind: "char", value: "ɛ" }],
        },
        {
          nodeId: unclaimedNodeId,
          context: [{ kind: "vkey", name: "K_W", modifiers: [] }],
          output: [{ kind: "char", value: "ɔ" }],
        },
      ],
    };
    const ir = makeTestIR([group]);

    // A minimal RecognizerRule standing in for "runs before s01Recognizer
    // and claims the first rule" — exercises the real match()/lift() loop
    // in recognizePatterns(), not a hand-simulated ownedByPattern stamp.
    const earlierClaimant: RecognizerRule = {
      id: "earlier-claimant",
      strategyId: "S-EARLIER",
      match: () => [
        {
          patternId: "earlier-claimant#main",
          ownedNodes: [{ kind: "rule", nodeId: claimedNodeId }],
          slotValues: {},
        },
      ],
      lift: (match) => ({
        id: match.patternId,
        title: "Earlier claimant",
        description: "Pre-existing owner",
        category: "desktop",
        appliesTo: [],
        origin: "recognized",
        ownedNodes: match.ownedNodes,
        questions: [],
        kmnFragment: "",
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "recognizer",
        reviewDate: "2026-01-01",
      }),
    };

    const { ir: out } = recognizePatterns(ir, [earlierClaimant, s01Recognizer]);

    // Exactly two patterns: the earlier claimant, and s01Recognizer's pattern
    // for ONLY the unclaimed rule — never a second pattern re-claiming
    // claimedNodeId.
    expect(out.recognizedPatterns).toHaveLength(2);
    const s01Pattern = out.recognizedPatterns.find((p) => p.id === "simple-swap#main");
    expect(s01Pattern).toBeDefined();
    expect(s01Pattern!.ownedNodes).toHaveLength(1);
    expect(s01Pattern!.ownedNodes?.[0]?.nodeId).toBe(unclaimedNodeId);

    // The claimed rule must still be stamped with its ORIGINAL owner, not
    // re-stamped by s01Recognizer's pattern.
    const claimedRule = out.groups[0]!.rules.find((r) => r.nodeId === claimedNodeId);
    expect(claimedRule?.ownedByPattern).toBe("earlier-claimant#main");

    // The claimed rule must not appear in s01Pattern's ownedNodes.
    const s01OwnedIds = new Set(s01Pattern!.ownedNodes?.map((n) => n.nodeId));
    expect(s01OwnedIds.has(claimedNodeId)).toBe(false);
  });

  it("passes assertOwnershipConsistency (no throw) for a normal recognized IR", () => {
    // Explicit lock for the "happy path doesn't throw" half of the ownership
    // invariant — recognizePatterns() calls assertOwnershipConsistency()
    // internally, so simply not throwing here is the assertion.
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "vkey", name: "K_Q", modifiers: [] }],
      output: [{ kind: "char", value: "ɛ" }],
    };
    const group: IRGroup = {
      nodeId: "group#0",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [rule],
    };
    const ir = makeTestIR([group]);
    expect(() => recognizePatterns(ir)).not.toThrow();
  });

  it("throws 'Ownership drift' when a RecognizerRule's lift() claims a nodeId that match() never stamped (hand-crafted inconsistency)", () => {
    // Construct the exact drift shape assertOwnershipConsistency guards
    // against, by driving the REAL recognizePatterns() pipeline with a
    // malicious RecognizerRule: match() reports ownedNodes for nodeId "X"
    // (which the loop uses to stamp ownedByPattern on the matching IRRule),
    // but lift() returns a Pattern whose ownedNodes additionally lists a
    // SECOND nodeId "Y" that was never stamped. That is precisely the
    // "ghost chip" divergence — a pattern claims a rule the rule itself does
    // not attribute back to it — and must throw rather than silently render
    // an inconsistent Inspector pair.
    const stampedNodeId = "rule#stamped-0";
    const ghostNodeId = "rule#ghost-0";
    const group: IRGroup = {
      nodeId: "group#0",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: stampedNodeId,
          context: [{ kind: "vkey", name: "K_Q", modifiers: [] }],
          output: [{ kind: "char", value: "ɛ" }],
        },
        // ghostNodeId deliberately does not exist as an IRRule at all —
        // ruleById.get(ghostNodeId) resolves to undefined, matching the
        // "missing (no such rule)" branch of assertOwnershipConsistency.
      ],
    };
    const ir = makeTestIR([group]);

    const driftingRule: RecognizerRule = {
      id: "drifting-rule",
      strategyId: "S-DRIFT",
      match: () => [
        {
          patternId: "drifted-pattern#main",
          ownedNodes: [{ kind: "rule", nodeId: stampedNodeId }],
          slotValues: {},
        },
      ],
      lift: (match) => ({
        id: match.patternId,
        title: "Drifted pattern",
        description: "Claims a rule it was never stamped for",
        category: "desktop",
        appliesTo: [],
        origin: "recognized",
        // Deliberately diverges from match.ownedNodes: adds ghostNodeId,
        // which the match()/stamping loop never touched.
        ownedNodes: [...match.ownedNodes, { kind: "rule", nodeId: ghostNodeId }],
        questions: [],
        kmnFragment: "",
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "recognizer",
        reviewDate: "2026-01-01",
      }),
    };

    expect(() => recognizePatterns(ir, [driftingRule])).toThrow(/Ownership drift/);
  });
});
