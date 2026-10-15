// bundleSummary — draft bundle descriptions for the rule builder (#1986).
//
// The old draft concatenated each selected family's engine-authored
// `explanation`, which (a) repeats the same sentence when two families share
// a kind, (b) embeds internal store ids in guarded-family sentences, and
// (c) leaks "the assist layer" into user copy for opaque families. This
// module collapses a selection to one segment per rule kind with counts
// added up, so the draft stays a short summary no matter how many families
// are selected. The panel turns each segment into a translated sentence via
// Lingui ICU plurals — internal names never reach the draft.

import type { IRRule } from "@keyboard-studio/contracts";
import {
  classifyRuleKind,
  type RuleFamily,
  type RuleKind,
} from "@keyboard-studio/engine/kmAssist";

/** One family plus the member rules that exist in the current selection. */
export interface FamilyGroup {
  family: RuleFamily;
  rules: IRRule[];
}

/** One line of the summary: a rule kind and how many selected rules it covers. */
export interface BundleSummarySegment {
  kind: RuleKind;
  /** Number of *selected* rules of this kind — not the whole family's count. */
  count: number;
}

/**
 * Collapse the selection to one segment per rule kind, in first-appearance
 * order. Counts reflect the selected rules only: a partially-selected family
 * contributes just its selected members. Rules covered by no family are
 * bucketed by their own kind so the draft never undercounts.
 */
export function summarizeSelection(
  groups: FamilyGroup[],
  ungroupedRules: IRRule[],
  includedIds: readonly string[],
): BundleSummarySegment[] {
  const included = new Set(includedIds);
  const segments: BundleSummarySegment[] = [];
  const byKind = new Map<RuleKind, BundleSummarySegment>();

  const add = (kind: RuleKind, count: number): void => {
    if (count <= 0) return;
    const existing = byKind.get(kind);
    if (existing === undefined) {
      const segment: BundleSummarySegment = { kind, count };
      byKind.set(kind, segment);
      segments.push(segment);
    } else {
      existing.count += count;
    }
  };

  for (const group of groups) {
    const selected = group.rules.filter(rule => included.has(rule.nodeId));
    add(group.family.kind, selected.length);
  }
  for (const rule of ungroupedRules) {
    if (included.has(rule.nodeId)) add(classifyRuleKind(rule), 1);
  }

  return segments;
}
