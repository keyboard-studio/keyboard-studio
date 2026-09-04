// carveCascade — resolves which leaf IR nodeIds a carve deletion set actually
// touches, per the shared deletion semantics (spec §8/§12 "re-projected
// layers"):
//   - IRGroup nodes: the entire group is dropped — the group's own rules AND
//     its group-owned RawKmnFragment nodes (tracked via `groupNodeId`) are
//     cascaded into the leaf sets without needing to be separately listed in
//     the input deletedNodeIds. The fragment half matters: a group-owned
//     opaque line left standing after its group header is deleted would be
//     re-attributed by kmcmplib to whichever group() header precedes it in
//     the file — or rejected outright if none does.
//   - IRRule nodes: the specific rule is dropped from its parent group.
//   - IRStore nodes: the store is dropped.
//   - RawKmnFragment nodes: the raw fragment is dropped.
//   - IRComment nodes: not individually deleteable via carve, but a comment
//     ANCHORED to a deleted node (leading or trailing, via `anchorRef`)
//     follows its node out — author prose documenting a deleted rule must not
//     survive to misdescribe whatever line physically follows it. Comments
//     with no anchorRef (freestanding) always survive.
//
// Factored out of carveFilterIr so both the IR-filtering path (carveFilterIr,
// emit()-based) and the text-splice path (carveViaSplice) resolve "what's
// actually gone" identically — the two can never semantically drift apart.

import type { KeyboardIR } from "@keyboard-studio/contracts";

/** The leaf-level nodeIds a deletion set resolves to, per node kind. */
export interface ResolvedCarveCascade {
  deletedStoreIds: ReadonlySet<string>;
  deletedGroupIds: ReadonlySet<string>;
  /** Includes rules cascaded from a deleted group's own rules[]. */
  deletedRuleIds: ReadonlySet<string>;
  /** Includes fragments cascaded from their owning group (groupNodeId). */
  deletedRawIds: ReadonlySet<string>;
  /** Comments whose anchorRef points at any deleted node above. */
  deletedCommentIds: ReadonlySet<string>;
}

/**
 * Resolve `deletedNodeIds` against `baseIr` into the leaf-level id sets the
 * deletion actually touches, applying the group→rules, group→fragments, and
 * node→anchored-comments cascades.
 *
 * @param baseIr         Source-of-truth IR (never mutated, never read after return).
 * @param deletedNodeIds Set of whole-node nodeIds the author marked for deletion.
 */
export function resolveCarveCascade(
  baseIr: KeyboardIR,
  deletedNodeIds: ReadonlySet<string>,
): ResolvedCarveCascade {
  const deletedGroupIds = new Set<string>();
  const deletedRuleIds = new Set<string>();

  for (const g of baseIr.groups) {
    if (deletedNodeIds.has(g.nodeId)) {
      deletedGroupIds.add(g.nodeId);
      for (const r of g.rules) deletedRuleIds.add(r.nodeId);
      continue;
    }
    for (const r of g.rules) {
      if (deletedNodeIds.has(r.nodeId)) deletedRuleIds.add(r.nodeId);
    }
  }

  const deletedStoreIds = new Set<string>(
    baseIr.stores.filter((s) => deletedNodeIds.has(s.nodeId)).map((s) => s.nodeId),
  );
  const deletedRawIds = new Set<string>(
    baseIr.raw
      .filter(
        (f) =>
          deletedNodeIds.has(f.nodeId) ||
          (f.groupNodeId !== undefined && deletedGroupIds.has(f.groupNodeId)),
      )
      .map((f) => f.nodeId),
  );

  const deletedLeafIds = new Set<string>([
    ...deletedGroupIds,
    ...deletedRuleIds,
    ...deletedStoreIds,
    ...deletedRawIds,
  ]);
  const deletedCommentIds = new Set<string>(
    baseIr.comments
      .filter((c) => c.anchorRef !== undefined && deletedLeafIds.has(c.anchorRef.nodeId))
      .map((c) => c.nodeId),
  );

  return { deletedStoreIds, deletedGroupIds, deletedRuleIds, deletedRawIds, deletedCommentIds };
}
