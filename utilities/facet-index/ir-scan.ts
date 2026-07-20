/**
 * Small shared IR-traversal helpers for the construction classifiers (spec 041).
 * Kept in one place so "iterate the keyboard's rules" and "which vkeys does a
 * rule touch" mean the same thing across the nine desktop classifiers.
 */

import type { KeyboardIR, IRGroup, IRRule, ContextElement } from "@keyboard-studio/contracts";

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

/**
 * The struck key a keystroke rule matches — the LAST context element (the token
 * after the final `+`). The IR flattens a rule's whole LHS into `context[]` with
 * no explicit `+` marker, so the key is positional: everything before the last
 * element is match-context, the last element is the key. Returns `undefined` for
 * an empty context (a non-keystroke / group-transition rule).
 */
export function ruleKey(rule: IRRule): ContextElement | undefined {
  return rule.context[rule.context.length - 1];
}

/** The match-context before the struck key (every context element but the last). */
export function ruleContextPrefix(rule: IRRule): ContextElement[] {
  return rule.context.slice(0, -1);
}

/** Context-element kinds that can stand in the struck-key position of a `using keys` rule. */
const KEY_MATCH_KINDS = new Set<ContextElement["kind"]>(["vkey", "char", "any", "notany"]);

/**
 * True if the rule is a keystroke rule — i.e. it lives in a `using keys` group
 * and its struck key (last context element) is a key-matcher: a positional
 * `[vkey]`, a character literal, or a store match `any()/notany()`. Keyboards
 * that remap via `+ any(store) > index(store,n)` or `"ctx" + <key>` are just as
 * much keystroke rules as `+ [K_X] > 'y'`, so matching only `vkey` (the pre-fix
 * behaviour) silently dropped ~100 store-driven / context-prefix keyboards to
 * `undetermined`. Context-group rules (not `using keys`) are context transforms,
 * never keystrokes, so the group gate is required once char keys are accepted.
 */
export function isKeystrokeRule(rule: IRRule, group: IRGroup): boolean {
  if (!group.usingKeys) return false;
  const key = ruleKey(rule);
  return key !== undefined && KEY_MATCH_KINDS.has(key.kind);
}
