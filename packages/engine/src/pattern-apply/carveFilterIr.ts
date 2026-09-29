// carveFilterIr — the pure deletion-filtered KeyboardIR producer for carve.
//
// This is the IR-projection half of the carve layer, factored out of
// applyCarveToVfs so the same deletion semantics can be consumed either as a
// fresh IR (the spec-014 mutate() seam, studio/steps/editorMutate.ts) or as a
// re-emitted .kmn (applyCarveToVfs, the live OSK / output pipeline). Both call
// this single function so the filtered IR is byte-identical across both paths.
//
// Deletion semantics (spec §8/§12 "re-projected layers"):
//   - IRGroup nodes: the entire group (header + all rules + its group-owned
//     RawKmnFragment nodes) is dropped.
//   - IRRule nodes: the specific rule is dropped from its parent group.
//   - IRStore nodes: the store is dropped.
//   - RawKmnFragment nodes: the raw fragment is dropped.
//   - IRComment nodes: not individually deleteable via carve, but a comment
//     anchored to a deleted node follows it out (see carveCascade's header).
//
// baseIr is NEVER mutated. A shallow copy of the IR is constructed with the
// filtered arrays. Groups whose rules are all deleted are NOT auto-deleted (the
// group header remains unless the group's own nodeId is in deletedNodeIds).
// A surviving group keeps its original object reference when none of its rules
// were deleted (structural sharing), matching applyCarveToVfs's prior behavior.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { resolveCarveCascade } from "./carveCascade.js";

/**
 * Produce a deletion-filtered copy of `baseIr`.
 *
 * Removes whole nodes (`deletedNodeIds`) from `stores`, `groups` (and rules
 * within surviving groups), and `raw`, plus comments anchored to any removed
 * node. `header` passes through untouched. `baseIr` is never mutated.
 *
 * The "what does this deletion set actually touch" resolution (including the
 * group→rules cascade) is shared with the text-splice carve path via
 * {@link resolveCarveCascade}, so the two paths can never semantically drift
 * apart on which nodes a given deletion removes.
 *
 * NOTE: store-slot item rewrites (the `<storeNodeId>#<index>` nul-filler path)
 * are NOT handled here — they are applied by {@link applyStoreSlotRemovals}
 * before this function (the caller partitions slot ids vs whole-node ids). Pass
 * the slot-removed IR as `baseIr` to compose the two.
 *
 * @param baseIr         Source-of-truth IR (never mutated).
 * @param deletedNodeIds Set of whole-node nodeIds the author marked for deletion.
 * @returns A fresh KeyboardIR with the deleted nodes filtered out.
 */
export function carveFilterIr(
  baseIr: KeyboardIR,
  deletedNodeIds: ReadonlySet<string>,
): KeyboardIR {
  const cascade = resolveCarveCascade(baseIr, deletedNodeIds);

  // FR-021 (T015): suppression-owned rules are never carve targets. A block
  // disposition rewrites the rule in place, and the carve deletion set still
  // names its nodeId (it WAS carved) — but the filter must not undo the
  // compiler's rewrite. The ownedByBehaviour stamp is the signal; allow-host
  // removals are already gone from the IR, so the filter simply finds nothing
  // for them (no double-removal). Group-level deletion still drops the whole
  // group (a stronger, explicit operation); the skip below only shields rules
  // in surviving groups.
  const ownedRuleIds = new Set<string>();
  for (const g of baseIr.groups) {
    for (const r of g.rules) {
      if (r.ownedByBehaviour !== undefined) ownedRuleIds.add(r.nodeId);
    }
  }
  const deletedRuleIds = new Set(
    [...cascade.deletedRuleIds].filter((id) => !ownedRuleIds.has(id)),
  );
  // Comments anchored to a kept (owned) rule survive with it — the cascade
  // dropped them because the rule's nodeId was in the deletion set.
  const deletedCommentIds = new Set(
    [...cascade.deletedCommentIds].filter((commentId) => {
      const comment = baseIr.comments.find((c) => c.nodeId === commentId);
      const anchorNodeId = comment?.anchorRef?.nodeId;
      return anchorNodeId === undefined || !ownedRuleIds.has(anchorNodeId);
    }),
  );

  return {
    ...baseIr,
    // Filter deleted stores.
    stores: baseIr.stores.filter((s) => !cascade.deletedStoreIds.has(s.nodeId)),
    // Filter deleted groups; within surviving groups, filter deleted rules.
    groups: baseIr.groups
      .filter((g) => !cascade.deletedGroupIds.has(g.nodeId))
      .map((g) => {
        const filteredRules = g.rules.filter((r) => !deletedRuleIds.has(r.nodeId));
        // Only allocate a new group object when rules actually changed.
        if (filteredRules.length === g.rules.length) return g;
        return { ...g, rules: filteredRules };
      }),
    // Raw fragments: filter out any deleted fragment nodes (including those
    // cascaded from their owning group); survivors are preserved so emit()'s
    // position-faithful path can interleave them.
    raw: baseIr.raw.filter((f) => !cascade.deletedRawIds.has(f.nodeId)),
    // Comments anchored to a deleted node are dropped WITH it — previously
    // emit() dropped them only by accident (it never looks up a filtered-out
    // rule's nodeId); filtering here makes the drop deliberate and keeps this
    // path in lockstep with carveViaSplice's comment handling.
    comments: baseIr.comments.filter((c) => !deletedCommentIds.has(c.nodeId)),
  };
}
