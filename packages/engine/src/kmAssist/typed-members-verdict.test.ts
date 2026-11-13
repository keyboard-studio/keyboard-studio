/**
 * Before and after the typed members (spec 116 phase 6): every text recogniser that
 * read `layer(...)` / `platform(...)` from a `raw` element, or an option-store / call
 * statement from a fragment, gives the same verdict for the typed member.
 *
 * "Before" is the IR a persisted draft still holds: `raw` elements. "After" is what the
 * codec produces now. One assertion pair per recogniser; the verdicts are compared, not
 * written out, so a change to either shape that moves one and not the other fails here.
 */

import { describe, expect, it } from "vitest";
import type { ContextElement, IRRule, OutputElement } from "@keyboard-studio/contracts";
import { classifyTouchRuleRole } from "@keyboard-studio/contracts";
import { cleanedContext } from "../recognizer/s02-families.js";
import { classifyRuleKind, isLayerDirective, isPlatformGuard, shapeContext, shapeOutput } from "./classify.js";
import { explainRule } from "./explain.js";
import { groupRules } from "./group.js";

const ruleOf = (context: ContextElement[], output: OutputElement[]): IRRule =>
  ({ nodeId: "r", context, output }) as IRRule;

const RAW_PLATFORM: ContextElement = { kind: "raw", text: "platform('touch')" };
const TYPED_PLATFORM: ContextElement = { kind: "platform", value: "touch" };
const RAW_LAYER: OutputElement = { kind: "raw", text: "layer('shift')" };
const TYPED_LAYER: OutputElement = { kind: "layer", value: "shift" };
const KEY: ContextElement = { kind: "vkey", name: "K_A", modifiers: [] };
const OUT_A: OutputElement = { kind: "char", value: "a" };

describe("kmAssist: a typed platform / layer classifies as the raw element did", () => {
  it("isPlatformGuard and isLayerDirective agree", () => {
    expect(isPlatformGuard(TYPED_PLATFORM)).toBe(isPlatformGuard(RAW_PLATFORM));
    expect(isPlatformGuard(TYPED_PLATFORM)).toBe(true);
    expect(isLayerDirective(TYPED_LAYER)).toBe(isLayerDirective(RAW_LAYER));
    expect(isLayerDirective(TYPED_LAYER)).toBe(true);
  });

  it("a platform-guarded rule: same kind, same shape context, same explanation", () => {
    const before = ruleOf([RAW_PLATFORM, KEY], [OUT_A]);
    const after = ruleOf([TYPED_PLATFORM, KEY], [OUT_A]);
    expect(classifyRuleKind(after)).toBe(classifyRuleKind(before));
    expect(shapeContext(after).map((e) => e.kind)).toEqual(shapeContext(before).map((e) => e.kind));
    expect(explainRule(after)).toBe(explainRule(before));
  });

  it("a layer-directive rule: same kind, same shape output, same explanation", () => {
    const before = ruleOf([KEY], [OUT_A, RAW_LAYER]);
    const after = ruleOf([KEY], [OUT_A, TYPED_LAYER]);
    expect(classifyRuleKind(after)).toBe(classifyRuleKind(before));
    expect(shapeOutput(after)).toEqual(shapeOutput(before));
    expect(explainRule(after)).toBe(explainRule(before));
  });

  it("family grouping keys are the same for the typed and raw guard", () => {
    const fam = (guard: ContextElement) =>
      groupRules([ruleOf([guard, { kind: "any", storeRef: "s" }, KEY], [OUT_A])]).map((f) => [f.id, f.kind, f.outputShape]);
    expect(fam(TYPED_PLATFORM)).toEqual(fam(RAW_PLATFORM));
  });
});

describe("kmAssist: a typed option-store or call statement stays opaque, as its fragment was", () => {
  it.each([
    ["set", { kind: "set", storeRef: "opt", value: [{ kind: "char", value: "1" }] } as OutputElement],
    ["save", { kind: "save", storeRef: "opt" } as OutputElement],
    ["reset", { kind: "reset", storeRef: "opt" } as OutputElement],
    ["call", { kind: "call", storeRef: "cb" } as OutputElement],
    ["return", { kind: "return" } as OutputElement],
  ])("%s", (_name, statement) => {
    const rule = ruleOf([KEY], [OUT_A, statement]);
    expect(classifyRuleKind(rule)).toBe("opaque");
  });

  it("the explanation names the same reason its fragment did", () => {
    const set = explainRule(ruleOf([KEY], [{ kind: "save", storeRef: "opt" }]));
    const call = explainRule(ruleOf([KEY], [{ kind: "call", storeRef: "cb" }]));
    expect(set).toContain("keyboard option");
    expect(call).toContain("custom code");
  });
});

describe("contracts and recognizer readers: a typed member reads as the raw element did", () => {
  it("classifyTouchRuleRole: layer is opaque typed or raw; statements are opaque", () => {
    expect(classifyTouchRuleRole([TYPED_LAYER])).toBe(classifyTouchRuleRole([RAW_LAYER]));
    expect(classifyTouchRuleRole([TYPED_LAYER])).toBe("opaque");
    expect(classifyTouchRuleRole([OUT_A, TYPED_LAYER])).toBe(classifyTouchRuleRole([OUT_A, RAW_LAYER]));
    expect(classifyTouchRuleRole([{ kind: "call", storeRef: "cb" }])).toBe("opaque");
  });

  it("cleanedContext: a platform element disqualifies the context, typed or raw", () => {
    const before = ruleOf([RAW_PLATFORM, KEY], [OUT_A]);
    const after = ruleOf([TYPED_PLATFORM, KEY], [OUT_A]);
    expect(cleanedContext(before)).toBeNull();
    expect(cleanedContext(after)).toBeNull();
  });
});
