/**
 * IR mutation: strip NCAPS modifier.
 *
 * Removes the "NCAPS" string from the modifiers array of every vkey context
 * element in every rule across all groups. The element and rule are preserved
 * even if modifiers becomes empty.
 *
 * This replicates the text-level `result.replace(/NCAPS /g, "")` in the
 * original applyKmnTransforms (scaffolder/index.ts:66).
 */

import type { KeyboardIR, IRRule, ContextElement } from "@keyboard-studio/contracts";

function stripNcapsFromElement(el: ContextElement): ContextElement {
  if (el.kind !== "vkey") return el;
  const filtered = el.modifiers.filter((m) => m !== "NCAPS");
  if (filtered.length === el.modifiers.length) return el; // nothing changed
  return { ...el, modifiers: filtered };
}

function stripNcapsFromRule(rule: IRRule): IRRule {
  const updated = rule.context.map(stripNcapsFromElement);
  const changed = updated.some((el, i) => el !== rule.context[i]);
  return changed ? { ...rule, context: updated } : rule;
}

/**
 * Mutate (shallow-clone) a KeyboardIR to strip the NCAPS modifier from
 * every vkey context element.
 *
 * @param ir  The source IR (not mutated in-place).
 * @returns   A new KeyboardIR with NCAPS stripped from all vkey modifiers.
 */
export function mutateStripNcaps(ir: KeyboardIR): KeyboardIR {
  const updatedGroups = ir.groups.map((group) => {
    const updatedRules = group.rules.map(stripNcapsFromRule);
    const changed = updatedRules.some((r, i) => r !== group.rules[i]);
    return changed ? { ...group, rules: updatedRules } : group;
  });
  const groupsChanged = updatedGroups.some((g, i) => g !== ir.groups[i]);
  return groupsChanged ? { ...ir, groups: updatedGroups } : ir;
}
