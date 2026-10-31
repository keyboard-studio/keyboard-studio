// Direct match/lift tests for the generated S-03 sequence-replace rule.
// S-03 has no hand-written twin (unlike S-01/S-02), so — per the issue #342
// ruling — these are direct assertions, not round-trip parity tests:
// the sil_ipa parallel-store shape in its guarded and unguarded forms,
// the evidence gate's refusals, and non-claims on neighbouring shapes.
import { describe, it, expect } from "vitest";
import { rule as sequenceReplace } from "./sequence-replace.js";
import { recognizePatterns } from "../../index.js";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import {
  buildIpaSequenceIR,
  buildAcuteSequenceIR,
  buildVniSequenceIR,
  buildTelexMultiTriggerIR,
  buildUnrelatedRemapIR,
  buildCompleteGraveIR,
  ipaSequenceRule,
  s01Rule,
} from "../__fixtures__/recognizerIr.js";

describe("generated/sequence-replace match", () => {
  it("unguarded sil_ipa pair: 1 match owning the rule and both stores, with pattern slots", () => {
    const { ir, ruleNodeId } = buildIpaSequenceIR({ guarded: false });
    const matches = sequenceReplace.match(ir);

    expect(matches).toHaveLength(1);
    const m = matches[0];
    expect(m).toBeDefined();
    expect(m!.patternId).toBe("context_sensitive_substitution#main:equalD>equalU");
    expect(m!.ownedNodes.map((n) => n.nodeId).sort()).toEqual(
      [ruleNodeId, "store#equalD", "store#equalU"].sort(),
    );
    expect(m!.slotValues["contextChars"]).toBe("bdg");
    expect(m!.slotValues["contextOutputs"]).toBe("ɓɗɠ");
    expect(m!.slotValues["triggerChar"]).toBe("=");
  });

  it("guarded sil_ipa pair (if-guard, offset 2): 1 match with the same slots", () => {
    const { ir } = buildIpaSequenceIR({ guarded: true });
    const matches = sequenceReplace.match(ir);

    expect(matches).toHaveLength(1);
    expect(matches[0]!.slotValues["triggerChar"]).toBe("=");
    expect(matches[0]!.slotValues["contextChars"]).toBe("bdg");
  });

  it("matches when the codec did not preserve the inline '+' as a raw element", () => {
    const ir = makeTestIR(
      [
        {
          nodeId: "group#main",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules: [ipaSequenceRule("rule#noplus", { guarded: false, withPlus: false })],
        },
      ],
      [
        { nodeId: "store#equalD", name: "equalD", isSystem: false, items: [..."bdg"].map((c) => ({ kind: "char" as const, value: c })) },
        { nodeId: "store#equalU", name: "equalU", isSystem: false, items: [..."ɓɗɠ"].map((c) => ({ kind: "char" as const, value: c })) },
      ],
    );
    expect(sequenceReplace.match(ir)).toHaveLength(1);
  });

  it("unguarded decomposition pair (aeiou → áéíóú): 1 match", () => {
    const { ir } = buildAcuteSequenceIR();
    const matches = sequenceReplace.match(ir);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe("context_sensitive_substitution#main:bases>marked");
    expect(matches[0]!.slotValues["triggerChar"]).toBe("'");
  });

  it("two store pairs in one IR lift as two clusters with distinct patternIds", () => {
    const ipa = buildIpaSequenceIR({ guarded: true });
    const acute = buildAcuteSequenceIR();
    const ir = makeTestIR(
      [
        {
          nodeId: "group#main",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules: [
            ...ipa.ir.groups[0]!.rules,
            ...acute.ir.groups[0]!.rules,
          ],
        },
      ],
      [...ipa.ir.stores, ...acute.ir.stores],
    );
    const matches = sequenceReplace.match(ir);
    expect(matches.map((m) => m.patternId).sort()).toEqual([
      "context_sensitive_substitution#main:bases>marked",
      "context_sensitive_substitution#main:equalD>equalU",
    ]);
  });
});

describe("generated/sequence-replace refusals", () => {
  it("wrong offset: guarded rule pointing at position 1 does not match", () => {
    const ir = makeTestIR(
      [
        {
          nodeId: "group#main",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules: [ipaSequenceRule("rule#bad-offset", { guarded: true, offset: 1 })],
        },
      ],
      buildIpaSequenceIR({ guarded: true }).ir.stores,
    );
    expect(sequenceReplace.match(ir)).toHaveLength(0);
  });

  it("wrong offset: unguarded rule pointing at position 2 does not match", () => {
    const ir = makeTestIR(
      [
        {
          nodeId: "group#main",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules: [ipaSequenceRule("rule#bad-offset-2", { guarded: false, offset: 2 })],
        },
      ],
      buildIpaSequenceIR({ guarded: false }).ir.stores,
    );
    expect(sequenceReplace.match(ir)).toHaveLength(0);
  });

  it("unguarded parallel remap with unrelated stores does not match (evidence gate)", () => {
    const { ir } = buildUnrelatedRemapIR();
    expect(sequenceReplace.match(ir)).toHaveLength(0);
  });

  it("S-02 deadkey cluster shape is not claimed", () => {
    const { ir } = buildCompleteGraveIR();
    expect(sequenceReplace.match(ir)).toHaveLength(0);
  });

  it("S-01 single-char swaps are not claimed", () => {
    const ir = makeTestIR(
      [
        {
          nodeId: "group#main",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules: [s01Rule("rule#0", "K_Q", [], "ɛ"), s01Rule("rule#1", "K_C", [], "ɔ")],
        },
      ],
      [],
    );
    expect(sequenceReplace.match(ir)).toHaveLength(0);
  });
});

describe("generated/sequence-replace lift + registry integration", () => {
  it("lift produces an S-03 Pattern with the schematic KMN fragment and survey questions", () => {
    const { ir } = buildIpaSequenceIR({ guarded: true });
    const match = sequenceReplace.match(ir)[0];
    expect(match).toBeDefined();
    const pattern = sequenceReplace.lift(match!);

    expect(pattern.strategyId).toBe("S-03");
    expect(pattern.title).toBe("Sequence replace");
    expect(pattern.origin).toBe("recognized");
    // Fragments keep {{slot}} placeholders (the S-01/S-02 convention);
    // slot values live in the questions' defaults, asserted below.
    expect(pattern.kmnFragment).toBe(
      'any({{contextChars}}) + "{{triggerChar}}" > index({{contextOutputs}}, 1)',
    );
    const trigger = pattern.questions.find((q) => q.id === "triggerChar");
    expect(trigger?.default).toBe("=");
    const chars = pattern.questions.find((q) => q.id === "contextChars");
    expect(chars?.default).toBe("bdg");
    // Survey-filled slots are present as questions without defaults.
    const def = pattern.questions.find((q) => q.id === "defaultOutput");
    expect(def).toBeDefined();
    expect(def!.default).toBeUndefined();
  });

  it("recognizePatterns stamps ownership and reports the pair as recognized", () => {
    const { ir, ruleNodeId } = buildIpaSequenceIR({ guarded: false });
    const result = recognizePatterns(ir);

    const pattern = result.ir.recognizedPatterns.find(
      (p) => p.id === "context_sensitive_substitution#main:equalD>equalU",
    );
    expect(pattern).toBeDefined();
    const rule = result.ir.groups[0]!.rules.find((r) => r.nodeId === ruleNodeId);
    expect(rule?.ownedByPattern).toBe("context_sensitive_substitution#main:equalD>equalU");
    expect(result.recognizedRatio).toBe(1);
  });
});

describe("generated/sequence-replace multi-cluster identity (#2225)", () => {
  it("vietnamese_vni shape: two clusters over one base store get distinct patternIds", () => {
    const { ir } = buildVniSequenceIR();
    const matches = sequenceReplace.match(ir);

    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.patternId).sort()).toEqual([
      "context_sensitive_substitution#main:vowels>vowels_huyen",
      "context_sensitive_substitution#main:vowels>vowels_sac",
    ]);
  });

  it("vietnamese_vni shape: recognizePatterns does not throw and stamps each rule with its own pattern", () => {
    const { ir, sacRuleNodeId, huyenRuleNodeId } = buildVniSequenceIR();
    const result = recognizePatterns(ir);

    const s03 = result.ir.recognizedPatterns.filter(
      (p) => p.strategyId === "S-03",
    );
    expect(s03.map((p) => p.id).sort()).toEqual([
      "context_sensitive_substitution#main:vowels>vowels_huyen",
      "context_sensitive_substitution#main:vowels>vowels_sac",
    ]);
    const byId = new Map(
      result.ir.groups[0]!.rules.map((r) => [r.nodeId, r.ownedByPattern]),
    );
    expect(byId.get(sacRuleNodeId)).toBe(
      "context_sensitive_substitution#main:vowels>vowels_sac",
    );
    expect(byId.get(huyenRuleNodeId)).toBe(
      "context_sensitive_substitution#main:vowels>vowels_huyen",
    );
    expect(result.recognizedRatio).toBe(1);
  });

  it("telex shape: one store pair with two triggers lifts as exactly one pattern", () => {
    const { ir, ruleNodeIds } = buildTelexMultiTriggerIR();
    const matches = sequenceReplace.match(ir);

    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe(
      "context_sensitive_substitution#main:vowels>vowels_sac",
    );
    expect(matches[0]!.ownedNodes.map((n) => n.nodeId)).toEqual(
      expect.arrayContaining(ruleNodeIds),
    );
    // Both triggers are slot data on the single pattern.
    expect(matches[0]!.slotValues["triggerChar"]).toContain("s");
    expect(matches[0]!.slotValues["triggerChar"]).toContain("S");
    expect(() => recognizePatterns(ir)).not.toThrow();
  });
});
