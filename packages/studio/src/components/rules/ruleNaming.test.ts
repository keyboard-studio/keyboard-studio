// ruleNaming.test.ts — author-language fired-rule naming (spec 082 FR-002).
//
// The name is NEVER a bare rule index: an owned rule names its owner, an
// unowned rule names its shape, and an unresolvable trace falls back to the
// trace context/output. The resolver (compiled ordinal → source line) is
// injected — see firedRuleMapping.test.ts for the mapping itself.

import { describe, expect, it } from "vitest";
import type { IRRule } from "@keyboard-studio/contracts";
import {
  describeRuleShape,
  firedRuleCaption,
  humanizeId,
  nameFiredRule,
  type FiredRuleResolver,
} from "./ruleNaming.ts";
import type { FiredRuleTrace } from "./demoSimulation.ts";

function makeRule(overrides: Partial<IRRule> = {}): IRRule {
  return {
    nodeId: "rule-1",
    context: [{ kind: "char", value: "a" }],
    output: [{ kind: "char", value: "b" }],
    ...overrides,
  } as IRRule;
}

const fired: FiredRuleTrace = {
  group: "main",
  ruleIndex: 2,
  matchedContext: "a",
  emittedOutput: "b",
};

describe("nameFiredRule", () => {
  it("names the owning pattern when the rule is pattern-owned", () => {
    const resolve: FiredRuleResolver = () =>
      makeRule({ ownedByPattern: "latin_diacritics" });
    const { name, provenance } = nameFiredRule(fired, resolve);
    expect(provenance).toBe("pattern");
    // Humanized id when no title lookup is provided — still author-meaningful.
    expect(name).toContain("Latin diacritics");
    expect(name).not.toMatch(/rule #?\d+/i);
  });

  it("uses the pattern title when the lookup provides one", () => {
    const resolve: FiredRuleResolver = () =>
      makeRule({ ownedByPattern: "latin_diacritics" });
    const { name } = nameFiredRule(fired, resolve, () => "Latin diacritics");
    expect(name).toContain("Latin diacritics");
  });

  it("names the rule shape for unowned rules", () => {
    const resolve: FiredRuleResolver = () =>
      makeRule({ context: [{ kind: "char", value: "5" }], output: [] });
    const { name, provenance } = nameFiredRule(fired, resolve);
    expect(provenance).toBe("shape");
    expect(name).toContain("5");
    expect(name).not.toMatch(/rule #?\d+/i);
  });

  it("names the owning behaviour when the rule is pack-installed (FR-015 traceability)", () => {
    const resolve: FiredRuleResolver = () =>
      makeRule({
        ownedByBehaviour: "cameroon-diacritic-blocking/cameroon_diacritic_blocking",
      });
    const { name, provenance } = nameFiredRule(fired, resolve);
    expect(provenance).toBe("behaviour");
    // The behaviour segment is humanized; the pack id is not shown.
    expect(name).toContain("Cameroon diacritic blocking");
    expect(name).not.toContain("cameroon-diacritic-blocking/");
    expect(name).not.toMatch(/rule #?\d+/i);
  });

  it("handles a bare behaviour id with no pack prefix", () => {
    const resolve: FiredRuleResolver = () =>
      makeRule({ ownedByBehaviour: "mark_on_non_base" });
    const { name, provenance } = nameFiredRule(fired, resolve);
    expect(provenance).toBe("behaviour");
    expect(name).toContain("Mark on non base");
  });

  it("falls back to trace context/output when the trace is unresolvable", () => {
    const resolve: FiredRuleResolver = () => undefined;
    const { name, provenance } = nameFiredRule(fired, resolve);
    expect(provenance).toBe("trace-context");
    expect(name).toContain("a");
    expect(name).toContain("b");
    // Never a bare index.
    expect(name).not.toBe("rule 2");
    expect(name).not.toMatch(/^rule \d+$/i);
  });

  it("handles empty-string matchedContext/emittedOutput (deadkey, > nul, beep)", () => {
    const resolve: FiredRuleResolver = () => undefined;
    const deadkeyFired: FiredRuleTrace = {
      group: "main",
      ruleIndex: 0,
      matchedContext: "",
      emittedOutput: "",
    };
    const { name } = nameFiredRule(deadkeyFired, resolve);
    expect(name.length).toBeGreaterThan(0);
    expect(name).not.toMatch(/^rule \d+$/i);
  });
});

describe("firedRuleCaption", () => {
  it("returns the author-language name", () => {
    const resolve: FiredRuleResolver = () =>
      makeRule({ ownedByPattern: "latin_diacritics" });
    expect(firedRuleCaption(fired, resolve)).toContain("Latin diacritics");
  });

  // FR-018: the trace names the family as well as the fired rule.
  it("prefixes the family name when familyNameFor resolves", () => {
    const resolve: FiredRuleResolver = () =>
      makeRule({ ownedByPattern: "latin_diacritics" });
    const caption = firedRuleCaption(fired, resolve, undefined, () => "Diacritic blocking");
    expect(caption.startsWith("Diacritic blocking — ")).toBe(true);
    expect(caption).toContain("Latin diacritics");
  });

  it("omits the family segment when the rule does not resolve", () => {
    const resolve: FiredRuleResolver = () => undefined;
    const caption = firedRuleCaption(fired, resolve, undefined, () => "Diacritic blocking");
    expect(caption).not.toContain("Diacritic blocking");
  });
});

describe("describeRuleShape", () => {
  it("summarizes a swallowing rule as no output", () => {
    const rule = makeRule({
      context: [{ kind: "char", value: "5" }],
      output: [],
    });
    expect(describeRuleShape(rule)).toContain("no output");
  });

  it("summarizes a deadkey-arming rule", () => {
    const rule = makeRule({ output: [{ kind: "deadkey", id: 3 }] });
    expect(describeRuleShape(rule)).toContain("deadkey(3)");
  });
});

describe("humanizeId", () => {
  it("humanizes snake_case ids", () => {
    expect(humanizeId("latin_diacritics")).toBe("Latin diacritics");
  });
});
