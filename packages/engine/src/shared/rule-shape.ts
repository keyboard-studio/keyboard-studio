/**
 * Small rule-output-shape predicates shared across engine submodules
 * (pattern-apply, recognizer) that need to recognize the same IR shapes
 * without creating a directional dependency between those submodules.
 *
 * `isPlusSeparator` now LIVES IN CONTRACTS and is re-exported here so every
 * existing engine and studio call site is unchanged. It moved because the
 * contracts-layer touch key↔rule join and `@keymanapp/keyboard-lint` both need
 * it and neither can import engine; the predicate is structurally typed, so the
 * move carries no IR coupling with it. Import it from either home — they are
 * the same function.
 */

import {
  ruleConditions,
  ruleExtraKeystrokeElements,
  ruleHasNulContext,
  ruleKeystrokeLoose,
  rulePreContext,
} from "@keyboard-studio/contracts";
import type { ContextElement, IRRule } from "@keyboard-studio/contracts";

export {
  isPlusSeparator,
  ruleLhsKind,
  ruleHasNulContext,
  ruleConditions,
  rulePreContext,
  ruleKeystroke,
  ruleKeystrokeLoose,
  ruleExtraKeystrokeElements,
  elementAtOffset,
  makeRule,
  withRuleParts,
} from "@keyboard-studio/contracts";
export type { LhsKind, MakeRuleParts } from "@keyboard-studio/contracts";

/**
 * Every context element of a rule in source order with the `+` separator
 * removed: `[nul?, ...conditions, ...preContext, keystroke?, ...extras]`. For
 * shape matchers that look at the whole left-hand side and have no group in
 * scope, hence the loose keystroke reader.
 */
export function ruleContextElements(rule: IRRule): ContextElement[] {
  const group = { usingKeys: true };
  const keystroke = ruleKeystrokeLoose(rule);
  return [
    ...(ruleHasNulContext(rule) ? [{ kind: "raw", text: "nul" } as const] : []),
    ...ruleConditions(rule),
    ...rulePreContext(rule, group),
    ...(keystroke !== undefined ? [keystroke] : []),
    ...ruleExtraKeystrokeElements(rule, group),
  ];
}

/**
 * True when a rule's ENTIRE output is exactly one `{kind:"deadkey"}` element.
 * This is the output-shape half of "is this an S-02 deadkey trigger rule";
 * callers that also need to check context do so themselves.
 */
export function isDeadkeyOnlyOutput(rule: { output: { kind: string }[] }): boolean {
  return rule.output.length === 1 && rule.output[0]?.kind === "deadkey";
}
