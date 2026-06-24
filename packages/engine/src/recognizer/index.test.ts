import { describe, it, expect } from "vitest";
import { recognizePatterns } from "./index.js";
import type { IRGroup, IRRule, IRStore } from "@keyboard-studio/contracts";
import { makeTestIR, charItems } from "@keyboard-studio/contracts/fixtures";

const makeIR = (groups: IRGroup[]) => makeTestIR(groups);

describe("recognizePatterns", () => {
  it("empty IR (no groups) returns empty recognizedPatterns and recognizedRatio 0", () => {
    const ir = makeIR([]);
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
    const ir = makeIR([group]);
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
    const ir = makeIR([group]);
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
    const ir = makeIR([group]);

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
});
