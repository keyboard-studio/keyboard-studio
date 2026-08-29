// carveCascade — resolves which leaf IR nodeIds a carve deletion set actually
// touches, per the shared deletion semantics (spec §8/§12 "re-projected
// layers"):
//   - IRGroup nodes: the entire group (header + all rules) is dropped — the
//     group's own rules are cascaded into deletedRuleIds without needing to be
//     separately listed in the input deletedNodeIds.
//   - IRRule nodes: the specific rule is dropped from its parent group.
//   - IRStore nodes: the store is dropped.
//   - RawKmnFragment nodes: the raw fragment is dropped.
//   - IRComment nodes: comments are not individually deleteable via carve.
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
  deletedRawIds: ReadonlySet<string>;
}

/**
 * Resolve `deletedNodeIds` against `baseIr` into the leaf-level id sets the
 * deletion actually touches, applying the group→rules cascade.
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
    baseIr.raw.filter((f) => deletedNodeIds.has(f.nodeId)).map((f) => f.nodeId),
  );

  return { deletedStoreIds, deletedGroupIds, deletedRuleIds, deletedRawIds };
}
