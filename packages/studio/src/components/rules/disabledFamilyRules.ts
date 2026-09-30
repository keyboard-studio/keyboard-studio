// disabledFamilyRules — spec 082 FR-018 "Disable group" enforcement.
//
// A disabled family is excluded from the working-copy compile projection
// (demo pane + download alike) by merging its member rule nodeIds into the
// projection's deletion set inside `useWorkingCopyTransform`. Pure: families
// are recomputed from the working IR's rules via kmAssist's `groupRules`;
// rule nodeIds are stable across the baseIr/working-IR seeding (both are
// seeded from the same IR object), so member ids computed here match the
// rules the baseIr projection filters. Ids for rules that exist only in the
// working IR (pack-installed additions) are harmless — the baseIr projection
// simply finds no match for them.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { groupRules } from "./ruleFamilies.ts";

/**
 * Member rule nodeIds of the given disabled families.
 *
 * Returns an empty set when the IR is null, no family is disabled, or none
 * of the disabled ids matches a current family (stale ids are ignored, never
 * error).
 */
export function disabledFamilyRuleIds(
  ir: KeyboardIR | null,
  disabledFamilyIds: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  if (ir === null || disabledFamilyIds.size === 0) return out;
  const rules = ir.groups.flatMap((g) => g.rules);
  for (const family of groupRules(rules)) {
    if (!disabledFamilyIds.has(family.id)) continue;
    for (const memberId of family.memberIds) out.add(memberId);
  }
  return out;
}
