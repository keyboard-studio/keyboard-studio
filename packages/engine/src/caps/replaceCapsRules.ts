// Key-scoped caps rewrite (spec 112, research R6): the transform `&CasedKeys`
// actually replaces. On the given keys, rules that test CAPS are deleted and
// the NCAPS token is removed from rules that test it (the rule is kept).

import {
  ruleConditions,
  ruleKeystroke,
  rulePreContext,
  withRuleParts,
  type ContextElement,
  type IRRule,
  type KeyboardIR,
} from "@keyboard-studio/contracts";

import { ruleContextElements } from "../shared/rule-shape.js";

const isCaps = (m: string): boolean => m.toUpperCase() === "CAPS";
const isNcaps = (m: string): boolean => m.toUpperCase() === "NCAPS";

/** `keys` holds upper-cased names; source spelling (`K_oE2`) may differ. */
const inKeys = (keys: ReadonlySet<string>, name: string): boolean => keys.has(name.toUpperCase());

function testsCapsOn(rule: IRRule, keys: ReadonlySet<string>): boolean {
  return ruleContextElements(rule).some(
    (el) => el.kind === "vkey" && inKeys(keys, el.name) && el.modifiers.some(isCaps),
  );
}

/** Delete CAPS-testing rules and remove NCAPS tokens, on the given keys only. */
export function replaceCapsRules(ir: KeyboardIR, keys: ReadonlySet<string>): void {
  const dropNcaps = (el: ContextElement): ContextElement =>
    el.kind === "vkey" && inKeys(keys, el.name) && el.modifiers.some(isNcaps)
      ? { ...el, modifiers: el.modifiers.filter((m) => !isNcaps(m)) }
      : el;
  for (const group of ir.groups) {
    if (group.readonly) continue;
    group.rules = group.rules
      .filter((r) => !testsCapsOn(r, keys))
      .map((rule) => {
        const keystroke = ruleKeystroke(rule, group);
        const conditions = ruleConditions(rule);
        const preContext = rulePreContext(rule, group);
        const nextConditions = conditions.map(dropNcaps);
        const nextPreContext = preContext.map(dropNcaps);
        const nextKeystroke = keystroke === undefined ? undefined : dropNcaps(keystroke);
        const changed =
          nextKeystroke !== keystroke ||
          nextConditions.some((el, i) => el !== conditions[i]) ||
          nextPreContext.some((el, i) => el !== preContext[i]);
        // Rules with no NCAPS token are kept as they are.
        if (!changed) return rule;
        return withRuleParts(rule, group, {
          conditions: nextConditions,
          preContext: nextPreContext,
          keystroke: nextKeystroke,
        });
      });
  }
}
