// Rule additions for the VFS projection (spec 082).
//
// Home (spec 090 T034): survey/rules/ — the rules step's feature home,
// moved from lib/ so the rule-set gallery decision module can import
// the splice (gallery modules may import only survey/** and packages).
// lib/ consumers import it from here (lib→survey feature-home edges
// are the codebase's existing pattern).
//
// The rules survey step writes its additions (pack install, guard synthesis,
// Narrow exceptions) into the working IR through the normal `setWorkingIR`
// path — the same path that carries touch-layout edits, context-tolerance
// rules, and touch rule synthesis. But `projectWorkingCopyVfs` projects from
// the BASE IR plus replayable overlays, so working-IR-only additions would
// silently drop out of the preview and download.
//
// This module is the shared seam that closes that gap. The three rules-step
// sources stamp everything they mint with `rulesStepAdded: true` (contracts:
// `IRRule.rulesStepAdded`, `IRStore.rulesStepAdded`); nothing else in the
// studio sets that marker. `deriveRuleAdditions` collects the marked nodes
// that are absent from the base IR, and `spliceRuleAdditions` merges them
// into a base-derived IR in working-IR order before the projection emits.
//
// Two hazards this design deliberately avoids:
//
//  1. Context-tolerance rules are written to the working IR AND replayed by
//     their own persisted overlay (projection step 2.7). A bare
//     working-vs-base diff would import them twice. The marker excludes
//     them: tolerance minting never stamps `rulesStepAdded`.
//  2. Touch rule synthesis mints producing/guard rules into the working IR
//     for the touch re-propagation flow (spec-014). Those carry no marker
//     and stay out of this seam; they reach the artifact through the
//     touch-propagation projection, not through step 1.
//
// Ordering matters: KMN uses first-match semantics, so a Narrow exception
// must stay immediately BEFORE its guard, and synthesized guards keep the
// append position the family card chose. `workingOrder` records the
// working-IR rule sequence per group; the splice reconstructs it (minus
// carve-deleted/disabled rules) rather than appending additions at the end.

import type { IRRule, IRStore, KeyboardIR } from "@keyboard-studio/contracts";

/** One group's share of the rules-step additions. */
export interface RuleAdditionGroup {
  /** nodeId of the working-IR group the rules were added to. */
  groupNodeId: string;
  /**
   * The working-IR rule sequence (nodeIds) for this group: base rules and
   * additions interleaved exactly as the rules step left them. The splice
   * walks this order so a Narrow exception stays before its guard.
   */
  workingOrder: string[];
  /** The marked rules absent from the base IR, in working order. */
  added: IRRule[];
}

/**
 * The rule-set decision value (spec 090, data-model.md RuleSetValue):
 * the builder's result in the builder seam's own shape — the marked
 * additions plus the working order that keeps Narrow exceptions ahead
 * of their guards. The gallery module re-exports this alias.
 */
export type RuleSetValue = DerivedRuleAdditions;

/** Everything the rules survey step added to the working IR. */
export interface DerivedRuleAdditions {
  groups: RuleAdditionGroup[];
  /**
   * Marked stores absent from the base IR (pack install only — guard
   * synthesis and Narrow never mint stores). Emitted alongside the rules
   * that reference them.
   */
  stores: IRStore[];
}

/** Shared empty derivation. Never mutate — treated as immutable by convention. */
export const EMPTY_RULE_ADDITIONS: DerivedRuleAdditions = {
  groups: [],
  stores: [],
};

/**
 * Collect the rules-step additions: marked rules/stores present in the
 * working IR but absent from the base IR. Pure; both IRs are untouched.
 *
 * A marked node whose nodeId already exists in the base IR is NOT treated
 * as an addition (defensive — markers are only ever set on freshly minted
 * nodes, so this should not happen, but the projection must never double
 * -emit a base rule).
 */
export function deriveRuleAdditions(
  workingIr: KeyboardIR | null | undefined,
  baseIr: KeyboardIR,
): DerivedRuleAdditions {
  if (workingIr == null) return EMPTY_RULE_ADDITIONS;

  const baseRuleIds = new Set<string>();
  for (const group of baseIr.groups) {
    for (const rule of group.rules) baseRuleIds.add(rule.nodeId);
  }
  const baseStoreIds = new Set<string>();
  for (const store of baseIr.stores) baseStoreIds.add(store.nodeId);

  const groups: RuleAdditionGroup[] = [];
  for (const workingGroup of workingIr.groups) {
    const added = workingGroup.rules.filter(
      (rule) => rule.rulesStepAdded === true && !baseRuleIds.has(rule.nodeId),
    );
    if (added.length === 0) continue;
    groups.push({
      groupNodeId: workingGroup.nodeId,
      workingOrder: workingGroup.rules.map((rule) => rule.nodeId),
      added,
    });
  }

  const stores = workingIr.stores.filter(
    (store) => store.rulesStepAdded === true && !baseStoreIds.has(store.nodeId),
  );

  if (groups.length === 0 && stores.length === 0) return EMPTY_RULE_ADDITIONS;
  return { groups, stores };
}

/** True when the derivation found anything to project. */
export function hasRuleAdditions(additions: DerivedRuleAdditions): boolean {
  return additions.groups.length > 0 || additions.stores.length > 0;
}

/**
 * Merge derived additions into a base-derived IR (already carve-filtered),
 * in working-IR order. Pure: the input IR is never mutated; groups that
 * gain nothing keep their object identity.
 *
 * @param ir the carve-filtered IR to project from.
 * @param additions the derivation from `deriveRuleAdditions`.
 * @param deletedRuleIds rule nodeIds the projection filtered out (carve
 *   deletions AND disabled-family members). An added rule that lands in
 *   this set — e.g. the user installed a pack then disabled its family —
 *   is NOT resurrected: it stays out of the projected artifact.
 */
export function spliceRuleAdditions(
  ir: KeyboardIR,
  additions: DerivedRuleAdditions,
  deletedRuleIds: ReadonlySet<string>,
): KeyboardIR {
  if (!hasRuleAdditions(additions)) return ir;

  const byGroup = new Map<string, RuleAdditionGroup>();
  for (const group of additions.groups) byGroup.set(group.groupNodeId, group);

  let groupsChanged = false;
  const groups = ir.groups.map((group) => {
    const addition = byGroup.get(group.nodeId);
    if (addition === undefined) return group;

    // Added rules that survived this projection's deletion filtering.
    const live = new Map<string, IRRule>();
    for (const rule of addition.added) {
      if (!deletedRuleIds.has(rule.nodeId)) live.set(rule.nodeId, rule);
    }
    if (live.size === 0) return group;

    // Reconstruct the working order: for each working-IR rule id, take the
    // added rule when live, else the surviving filtered rule. Working rules
    // absent from the filtered IR (carve-deleted, disabled, or from a stale
    // working IR) are skipped, never reintroduced.
    const present = new Map<string, IRRule>();
    for (const rule of group.rules) present.set(rule.nodeId, rule);
    const rules: IRRule[] = [];
    for (const nodeId of addition.workingOrder) {
      const addedRule = live.get(nodeId);
      if (addedRule !== undefined) {
        rules.push(addedRule);
        continue;
      }
      const surviving = present.get(nodeId);
      if (surviving !== undefined) rules.push(surviving);
    }
    // Defensive: filtered rules the working order does not know (should not
    // happen) are appended rather than dropped.
    const seen = new Set(rules.map((rule) => rule.nodeId));
    for (const rule of group.rules) {
      if (!seen.has(rule.nodeId)) rules.push(rule);
    }

    groupsChanged = true;
    return { ...group, rules };
  });

  let stores = ir.stores;
  const presentStoreNames = new Set(ir.stores.map((store) => store.name));
  const newStores = additions.stores.filter((store) => {
    // Dedupe by name both against the target IR and within the addition
    // batch itself (two marked same-named stores must not double-emit).
    if (presentStoreNames.has(store.name)) return false;
    presentStoreNames.add(store.name);
    return true;
  });
  if (newStores.length > 0) {
    stores = [...ir.stores, ...newStores];
  }

  if (!groupsChanged && stores === ir.stores) return ir;
  return { ...ir, groups, stores };
}

/**
 * A primitive-stable memo key for the derivation: changes exactly when a
 * group's rule sequence changes (addition, removal, or reorder — the
 * Narrow before-guard placement is position-sensitive, so the key covers
 * the full working order, not just the added ids). Empty when there is
 * nothing to project.
 */
export function ruleAdditionsKey(additions: DerivedRuleAdditions): string {
  const parts: string[] = [];
  for (const group of additions.groups) {
    parts.push(`${group.groupNodeId}:${group.workingOrder.join(",")}`);
  }
  for (const store of additions.stores) {
    parts.push(`store:${store.nodeId}`);
  }
  return parts.join("|");
}
