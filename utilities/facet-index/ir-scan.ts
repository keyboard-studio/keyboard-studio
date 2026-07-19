/**
 * Small shared IR-traversal helpers for the construction classifiers (spec 041).
 * Kept in one place so "iterate the keyboard's rules" and "which vkeys does a
 * rule touch" mean the same thing across the nine desktop classifiers.
 */

import type { KeyboardIR, IRGroup, IRRule } from "@keyboard-studio/contracts";

/** One rule with a deterministic, human-auditable location string. */
export interface RuleRef {
  group: IRGroup;
  rule: IRRule;
  /** `group(<name>)#<rule-index>` — stable across comment/whitespace edits. */
  location: string;
}

/**
 * Every rule across the keyboard's groups, in declaration order, each tagged
 * with a deterministic location. Groups are visited in `ir.groups` order and
 * rules in `group.rules` order — both are parse-structure order, so the result
 * is stable under comment/whitespace-only edits (FR-006).
 */
export function eachRule(ir: KeyboardIR): RuleRef[] {
  const out: RuleRef[] = [];
  for (const group of ir.groups) {
    group.rules.forEach((rule, index) => {
      out.push({ group, rule, location: `group(${group.name})#${index}` });
    });
  }
  return out;
}

/** The distinct virtual-key names a rule's context matches (positional keys). */
export function ruleVkeys(rule: IRRule): string[] {
  const names: string[] = [];
  for (const el of rule.context) {
    if (el.kind === "vkey") names.push(el.name);
  }
  return names;
}

/** True if the rule's context matches any physical virtual key (a keystroke rule). */
export function isKeystrokeRule(rule: IRRule): boolean {
  return rule.context.some((el) => el.kind === "vkey");
}
