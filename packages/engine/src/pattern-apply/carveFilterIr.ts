// carveFilterIr — the pure deletion-filtered KeyboardIR producer for carve.
//
// This is the IR-projection half of the carve layer, factored out of
// applyCarveToVfs so the same deletion semantics can be consumed either as a
// fresh IR (the spec-014 mutate() seam, studio/steps/editorMutate.ts) or as a
// re-emitted .kmn (applyCarveToVfs, the live OSK / output pipeline). Both call
// this single function so the filtered IR is byte-identical across both paths.
//
// Deletion semantics (spec §8/§12 "re-projected layers"):
//   - IRGroup nodes: the entire group (header + all rules) is dropped.
//   - IRRule nodes: the specific rule is dropped from its parent group.
//   - IRStore nodes: the store is dropped.
//   - RawKmnFragment nodes: the raw fragment is dropped.
//   - IRComment nodes: comments are not individually deleteable via carve.
//
// baseIr is NEVER mutated. A shallow copy of the IR is constructed with the
// filtered arrays. Groups whose rules are all deleted are NOT auto-deleted (the
// group header remains unless the group's own nodeId is in deletedNodeIds).
// A surviving group keeps its original object reference when none of its rules
// were deleted (structural sharing), matching applyCarveToVfs's prior behavior.

import type { KeyboardIR } from "@keyboard-studio/contracts";

/**
 * Produce a deletion-filtered copy of `baseIr`.
 *
 * Removes whole nodes (`deletedNodeIds`) from `stores`, `groups` (and rules
 * within surviving groups), and `raw`. `header` and `comments` pass through
 * untouched. `baseIr` is never mutated.
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
  return {
    ...baseIr,
    // Filter deleted stores.
    stores: baseIr.stores.filter((s) => !deletedNodeIds.has(s.nodeId)),
    // Filter deleted groups; within surviving groups, filter deleted rules.
    groups: baseIr.groups
      .filter((g) => !deletedNodeIds.has(g.nodeId))
      .map((g) => {
        const filteredRules = g.rules.filter((r) => !deletedNodeIds.has(r.nodeId));
        // Only allocate a new group object when rules actually changed.
        if (filteredRules.length === g.rules.length) return g;
        return { ...g, rules: filteredRules };
      }),
    // Raw fragments: filter out any deleted fragment nodes; survivors are
    // preserved so emit()'s position-faithful path can interleave them.
    raw: baseIr.raw.filter((f) => !deletedNodeIds.has(f.nodeId)),
    // Comments are not individually deleteable via carve; pass through.
    comments: baseIr.comments,
  };
}
