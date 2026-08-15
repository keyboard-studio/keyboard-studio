/**
 * ir-insert — the two structural placement rules every IR rule synthesizer
 * must obey, in one place.
 *
 * Both started life private to [mark-guards.ts](./mark-guards.ts). Touch-rule
 * synthesis (spec 063) needs the identical semantics — same entry-group choice,
 * same terminal-rule constraint — and two synthesizers picking their own
 * insertion point is how one of them ends up emitting a group that kmcmplib
 * rejects, or a rule the compiler silently never reaches. Lifting them here
 * makes divergence impossible rather than merely unlikely.
 *
 * Pure functions over IR nodes; no I/O, no raw `.kmn` text.
 */

import type { IRGroup, IRRule } from "@keyboard-studio/contracts";

/**
 * The entry group: the first writable using-keys group (KMN's `begin` target).
 *
 * `readonly` groups are skipped — those are groups the codec could not fully
 * model, and writing into one would mean emitting alongside text we cannot
 * reason about.
 */
export function entryGroupOf(groups: IRGroup[]): IRGroup | undefined {
  return groups.find((g) => g.usingKeys && !g.readonly);
}

/**
 * Insert a rule immediately before the first match/nomatch rule in the group,
 * or append if there is none. kmcmplib requires match/nomatch rules to be last
 * in a group, so any newly generated ordinary rule must land before them, not
 * after.
 */
export function insertBeforeTerminalRules(rules: IRRule[], rule: IRRule): IRRule[] {
  const idx = rules.findIndex((r) => r.matchKind === "match" || r.matchKind === "nomatch");
  if (idx === -1) return [...rules, rule];
  return [...rules.slice(0, idx), rule, ...rules.slice(idx)];
}

/**
 * Insert several rules as a CONTIGUOUS block before the group's terminal rules,
 * preserving the given order.
 *
 * Contiguity and order are correctness, not tidiness: a synthesized guard rule
 * and the producing rule it guards must emit as an adjacent guard-then-producing
 * pair, because a producing rule that precedes its guard silently defeats it.
 * Calling {@link insertBeforeTerminalRules} in a loop happens to preserve order
 * today, but nothing about its contract promises that — this does.
 */
export function insertBlockBeforeTerminalRules(rules: IRRule[], block: IRRule[]): IRRule[] {
  if (block.length === 0) return rules;
  const idx = rules.findIndex((r) => r.matchKind === "match" || r.matchKind === "nomatch");
  if (idx === -1) return [...rules, ...block];
  return [...rules.slice(0, idx), ...block, ...rules.slice(idx)];
}

/**
 * Insert a rule immediately AFTER a given existing rule, identified by
 * reference identity, falling back to {@link insertBeforeTerminalRules} when
 * the anchor is not in the list.
 *
 * Used when a guard for this key already exists and only the producing rule is
 * being added: it must land directly after that guard, never at the group tail,
 * where an intervening rule could match first.
 */
export function insertAfterRule(rules: IRRule[], anchor: IRRule, rule: IRRule): IRRule[] {
  const idx = rules.indexOf(anchor);
  if (idx === -1) return insertBeforeTerminalRules(rules, rule);
  return [...rules.slice(0, idx + 1), rule, ...rules.slice(idx + 1)];
}
