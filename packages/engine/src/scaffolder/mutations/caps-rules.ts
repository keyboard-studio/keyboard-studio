/**
 * IR mutation: delete CAPS rules.
 *
 * Removes any IRRule from its group's rules array when the rule's context
 * contains a vkey element with:
 *   - modifiers.includes("CAPS"), OR
 *   - name starts with "CAPS" (bare [CAPS] context element)
 *
 * This replicates the text-level line-delete at scaffolder/index.ts:67-70
 * (`filter((line) => !line.includes("[CAPS"))`).
 */

import type { KeyboardIR, IRRule } from "@keyboard-studio/contracts";

function ruleHasCaps(rule: IRRule): boolean {
  return rule.context.some(
    (el) =>
      el.kind === "vkey" &&
      (el.modifiers.includes("CAPS") || /^CAPS\b/.test(el.name))
  );
}

/**
 * Mutate (shallow-clone) a KeyboardIR to delete all CAPS rules.
 *
 * A rule is deleted if any of its context elements is a vkey with modifier
 * "CAPS" or whose name starts with "CAPS".
 *
 * @param ir  The source IR (not mutated in-place).
 * @returns   A new KeyboardIR with CAPS rules removed.
 */
export function mutateDeleteCapsRules(ir: KeyboardIR): KeyboardIR {
  const updatedGroups = ir.groups.map((group) => {
    const filtered = group.rules.filter((r) => !ruleHasCaps(r));
    return filtered.length !== group.rules.length
      ? { ...group, rules: filtered }
      : group;
  });
  const changed = updatedGroups.some((g, i) => g !== ir.groups[i]);
  return changed ? { ...ir, groups: updatedGroups } : ir;
}
