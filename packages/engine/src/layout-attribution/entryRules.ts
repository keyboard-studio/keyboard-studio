// The entry group's rules and the opaque rule fragments inside it, each classified once.

import type { IRGroup, IRRule, KeyboardIR, RawKmnFragment } from "@keyboard-studio/contracts";
import { classifyRule } from "./classifyRule.js";
import type { RuleClassification } from "./classifyRule.js";

/**
 * The group `begin Unicode` uses; the first writable using-keys group when the IR names
 * none (the emitter's own fallback). Unlike the edit path this never throws: a readonly
 * entry group is returned, and its rules classify as read-only.
 */
export function entryGroupOfIr(ir: KeyboardIR): IRGroup | undefined {
  const named = ir.header.entryPoints?.main;
  if (named !== undefined) {
    return ir.groups.find((g) => g.name === named) ?? ir.groups.find((g) => g.name.toLowerCase() === named.toLowerCase());
  }
  return ir.groups.find((g) => g.usingKeys && !g.readonly);
}

export interface ClassifiedRule {
  /** The rule's node id (or the fragment's). */
  nodeId: string;
  rule: IRRule | RawKmnFragment;
  group: IRGroup;
  cls: RuleClassification;
}

/**
 * The entry group's opaque rule fragments, then its rules in group order. A fragment's
 * position among the rules is unknown, so it is listed first: consumers treat it as
 * possibly firing first (when in doubt, read-only). Fragments that are not rules (no `>`)
 * are skipped.
 */
export function classifyEntryRules(ir: KeyboardIR): ClassifiedRule[] {
  const group = entryGroupOfIr(ir);
  if (group === undefined) return [];
  const out: ClassifiedRule[] = [];
  for (const frag of ir.raw) {
    if (frag.groupNodeId !== group.nodeId || !frag.sourceText.includes(">")) continue;
    out.push({ nodeId: frag.nodeId, rule: frag, group, cls: classifyRule(ir, group, frag) });
  }
  for (const rule of group.rules) {
    out.push({ nodeId: rule.nodeId, rule, group, cls: classifyRule(ir, group, rule) });
  }
  return out;
}
