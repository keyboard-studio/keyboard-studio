import { describe, expect, it } from "vitest";
import type { ContextElement, IRGroup, IRRule } from "./keyboard-ir.js";
import {
  elementAtOffset,
  makeRule,
  ruleConditions,
  ruleExtraKeystrokeElements,
  ruleHasNulContext,
  ruleKeystroke,
  ruleKeystrokeLoose,
  ruleLhsKind,
  rulePreContext,
  withRuleParts,
} from "./rule-shape.js";

const keys: Pick<IRGroup, "usingKeys"> = { usingKeys: true };
const noKeys: Pick<IRGroup, "usingKeys"> = { usingKeys: false };

const plus: ContextElement = { kind: "raw", text: "+" };
const nul: ContextElement = { kind: "raw", text: "nul" };
const ch = (value: string): ContextElement => ({ kind: "char", value });
const vk = (name: string, modifiers: string[] = []): ContextElement => ({ kind: "vkey", name, modifiers });
const anyEl = (storeRef: string): ContextElement => ({ kind: "any", storeRef });
const guard = (store: string, value: string): ContextElement => ({ kind: "if", store, value });

function rule(context: ContextElement[], extra: Partial<IRRule> = {}): IRRule {
  return { nodeId: "r1", context, output: [{ kind: "char", value: "x" }], ...extra };
}

describe("ruleKeystroke / rulePreContext", () => {
  it("bare keystroke without a separator", () => {
    const r = rule([vk("K_A")]);
    expect(ruleKeystroke(r, keys)).toEqual(vk("K_A"));
    expect(rulePreContext(r, keys)).toEqual([]);
  });

  it("inline + splits pre-context from the keystroke", () => {
    const r = rule([ch("a"), ch("b"), plus, vk("K_A")]);
    expect(ruleKeystroke(r, keys)).toEqual(vk("K_A"));
    expect(rulePreContext(r, keys)).toEqual([ch("a"), ch("b")]);
  });

  it("without a + the last element is the keystroke", () => {
    const r = rule([ch("a"), vk("K_A")]);
    expect(ruleKeystroke(r, keys)).toEqual(vk("K_A"));
    expect(rulePreContext(r, keys)).toEqual([ch("a")]);
  });

  it("two + separators: the keystroke follows the last one, separators are never pre-context", () => {
    const r = rule([ch("a"), plus, ch("b"), plus, vk("K_A")]);
    expect(ruleKeystroke(r, keys)).toEqual(vk("K_A"));
    expect(rulePreContext(r, keys)).toEqual([ch("a"), ch("b")]);
  });

  it("a vkey before the + is pre-context, not the keystroke", () => {
    const r = rule([vk("K_B"), plus, ch("z")]);
    expect(ruleKeystroke(r, keys)).toEqual(ch("z"));
    expect(rulePreContext(r, keys)).toEqual([vk("K_B")]);
  });

  it("any() can be the keystroke", () => {
    const r = rule([ch("a"), plus, anyEl("s")]);
    expect(ruleKeystroke(r, keys)).toEqual(anyEl("s"));
    expect(rulePreContext(r, keys)).toEqual([ch("a")]);
    expect(ruleKeystroke(rule([anyEl("s")]), keys)).toEqual(anyEl("s"));
  });

  it("a group that is not using keys has no keystroke; everything is pre-context", () => {
    const r = rule([ch("a"), ch("b")]);
    expect(ruleKeystroke(r, noKeys)).toBeUndefined();
    expect(rulePreContext(r, noKeys)).toEqual([ch("a"), ch("b")]);
  });

  it("match and nomatch rules have no context parts", () => {
    for (const matchKind of ["match", "nomatch"] as const) {
      const r = rule([], { matchKind });
      expect(ruleLhsKind(r)).toBe(matchKind);
      expect(ruleKeystroke(r, keys)).toBeUndefined();
      expect(rulePreContext(r, keys)).toEqual([]);
      expect(ruleHasNulContext(r)).toBe(false);
    }
    expect(ruleLhsKind(rule([vk("K_A")]))).toBe("input");
  });

  it("a rule whose only element is a head condition has no keystroke", () => {
    expect(ruleKeystroke(rule([guard("s", "1")]), keys)).toBeUndefined();
  });

  it("more than one keystroke element: first is the keystroke, the rest are extras", () => {
    const r = rule([ch("a"), plus, vk("K_A"), vk("K_B")]);
    expect(ruleKeystroke(r, keys)).toEqual(vk("K_A"));
    expect(ruleExtraKeystrokeElements(r, keys)).toEqual([vk("K_B")]);
    expect(ruleExtraKeystrokeElements(rule([ch("a"), plus, vk("K_A")]), keys)).toEqual([]);
  });

  it("ruleKeystrokeLoose agrees with ruleKeystroke in a using-keys group", () => {
    const r = rule([ch("a"), plus, vk("K_A")]);
    expect(ruleKeystrokeLoose(r)).toEqual(ruleKeystroke(r, keys));
  });
});

describe("ruleHasNulContext / ruleConditions", () => {
  it("a leading nul", () => {
    const r = rule([nul, plus, vk("K_A")]);
    expect(ruleHasNulContext(r)).toBe(true);
    expect(ruleConditions(r)).toEqual([]);
    expect(rulePreContext(r, keys)).toEqual([]);
    expect(ruleKeystroke(r, keys)).toEqual(vk("K_A"));
    expect(ruleHasNulContext(rule([vk("K_A")]))).toBe(false);
  });

  it("head if() guards are conditions, not pre-context", () => {
    const g1 = guard("&platform", "touch");
    const g2 = guard("opt", "1");
    const r = rule([g1, g2, ch("a"), plus, vk("K_A")]);
    expect(ruleConditions(r)).toEqual([g1, g2]);
    expect(rulePreContext(r, keys)).toEqual([ch("a")]);
    expect(ruleKeystroke(r, keys)).toEqual(vk("K_A"));
  });

  it("platform() and baselayout() heads are conditions", () => {
    const p: ContextElement = { kind: "raw", text: "platform('touch')" };
    const b: ContextElement = { kind: "baselayout", value: "en-US" };
    expect(ruleConditions(rule([p, b, plus, vk("K_A")]))).toEqual([p, b]);
  });

  it("a non-head if() stays in pre-context", () => {
    const g = guard("opt", "1");
    const r = rule([ch("a"), g, plus, vk("K_A")]);
    expect(ruleConditions(r)).toEqual([]);
    expect(rulePreContext(r, keys)).toEqual([ch("a"), g]);
  });
});

describe("elementAtOffset", () => {
  it("resolves 2 to the any(s) element on `if(...) any(s) + \"k\" > index(t,2)`", () => {
    const g = guard("opt", "1");
    const a = anyEl("s");
    const r = rule([g, a, plus, ch("k")]);
    expect(elementAtOffset(r, keys, 1)).toEqual(g);
    expect(elementAtOffset(r, keys, 2)).toEqual(a);
    expect(elementAtOffset(r, keys, 3)).toEqual(ch("k"));
    expect(elementAtOffset(r, keys, 4)).toBeUndefined();
  });

  it("never counts the separator and counts nul first", () => {
    const r = rule([nul, ch("a"), plus, vk("K_A")]);
    expect(elementAtOffset(r, keys, 1)).toEqual(nul);
    expect(elementAtOffset(r, keys, 2)).toEqual(ch("a"));
    expect(elementAtOffset(r, keys, 3)).toEqual(vk("K_A"));
  });

  it("rejects 0, negatives and non-integers", () => {
    const r = rule([vk("K_A")]);
    expect(elementAtOffset(r, keys, 0)).toBeUndefined();
    expect(elementAtOffset(r, keys, -1)).toBeUndefined();
    expect(elementAtOffset(r, keys, 1.5)).toBeUndefined();
  });

  it("outside using keys there is no keystroke slot", () => {
    const r = rule([ch("a"), ch("b")]);
    expect(elementAtOffset(r, noKeys, 2)).toEqual(ch("b"));
    expect(elementAtOffset(r, noKeys, 3)).toBeUndefined();
  });
});

describe("makeRule / withRuleParts", () => {
  const out = [{ kind: "char" as const, value: "x" }];

  it("writes the separator only with a lead and a keystroke in a using-keys group", () => {
    expect(makeRule({ nodeId: "r", output: out, keystroke: vk("K_A") }, keys).context).toEqual([vk("K_A")]);
    expect(
      makeRule({ nodeId: "r", output: out, preContext: [ch("a")], keystroke: vk("K_A") }, keys).context,
    ).toEqual([ch("a"), plus, vk("K_A")]);
    expect(
      makeRule({ nodeId: "r", output: out, conditions: [guard("s", "1")], keystroke: vk("K_A") }, keys).context,
    ).toEqual([guard("s", "1"), plus, vk("K_A")]);
    expect(
      makeRule({ nodeId: "r", output: out, nulContext: true, keystroke: vk("K_A") }, keys).context,
    ).toEqual([nul, plus, vk("K_A")]);
    expect(
      makeRule({ nodeId: "r", output: out, preContext: [ch("a")] }, noKeys).context,
    ).toEqual([ch("a")]);
  });

  it("a match rule has an empty context and carries matchKind", () => {
    const r = makeRule({ nodeId: "r", output: out, lhsKind: "nomatch", preContext: [ch("a")] }, keys);
    expect(r.context).toEqual([]);
    expect(r.matchKind).toBe("nomatch");
  });

  it("passes the non-shape fields through and omits absent ones", () => {
    const r = makeRule(
      {
        nodeId: "r",
        output: out,
        keystroke: vk("K_A"),
        trailingComment: "c1",
        targetSelector: "keymanweb",
        ownedByPattern: "p",
        rulesStepAdded: true,
        sourceLine: 7,
      },
      keys,
    );
    expect(r).toEqual({
      nodeId: "r",
      context: [vk("K_A")],
      output: out,
      trailingComment: "c1",
      targetSelector: "keymanweb",
      ownedByPattern: "p",
      rulesStepAdded: true,
      sourceLine: 7,
    });
    expect(Object.keys(makeRule({ nodeId: "r", output: out }, keys)).sort()).toEqual(["context", "nodeId", "output"]);
  });

  it("makeRule round-trips through the readers", () => {
    const g = guard("s", "1");
    const r = makeRule(
      { nodeId: "r", output: out, nulContext: true, conditions: [g], preContext: [ch("a")], keystroke: vk("K_A") },
      keys,
    );
    expect(ruleHasNulContext(r)).toBe(true);
    expect(ruleConditions(r)).toEqual([g]);
    expect(rulePreContext(r, keys)).toEqual([ch("a")]);
    expect(ruleKeystroke(r, keys)).toEqual(vk("K_A"));
  });

  it("withRuleParts returns a new rule, patches the named parts and never mutates", () => {
    const original = rule([ch("a"), plus, vk("K_A")], { sourceLine: 3, trailingComment: "t" });
    const snapshot = structuredClone(original);
    const next = withRuleParts(original, keys, { preContext: [ch("b")] });
    expect(next).not.toBe(original);
    expect(original).toEqual(snapshot);
    expect(next.context).toEqual([ch("b"), plus, vk("K_A")]);
    expect(next.sourceLine).toBe(3);
    expect(next.trailingComment).toBe("t");
    expect(withRuleParts(original, keys, { output: [] }).output).toEqual([]);
    expect(withRuleParts(original, keys, { preContext: [] }).context).toEqual([vk("K_A")]);
  });

  it("withRuleParts can clear the keystroke", () => {
    const next = withRuleParts(rule([ch("a"), plus, vk("K_A")]), keys, { keystroke: undefined });
    expect(next.context).toEqual([ch("a")]);
  });
});
