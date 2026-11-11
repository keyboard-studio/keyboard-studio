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
// startIr is NEVER mutated. A shallow copy of the IR is constructed with the
// filtered arrays. Groups whose rules are all deleted are NOT auto-deleted (the
// group header remains unless the group's own nodeId is in deletedNodeIds).
// A surviving group keeps its original object reference when none of its rules
// were deleted (structural sharing), matching applyCarveToVfs's prior behavior.
//
// Header: passes through, except the derived FR-004 entry-point flags
// (`entryPoints.newContext` / `postKeystroke`), which parse() derives from the
// presence of the reserved groups. Deleting `group(NewContext)` must clear the
// flag, or this IR disagrees with a re-parse of the carveViaSplice text.
// Likewise the header fields parse() derives from system stores (name /
// copyright / version / targets): deleting the backing store clears the
// field — see reconcileHeaderSystemStores.

import type { IRGroup, IRHeader, IRStore, KeyboardIR } from "@keyboard-studio/contracts";
import { resolveCarveCascade } from "./carveCascade.js";

/**
 * Produce a deletion-filtered copy of `startIr`.
 *
 * Removes whole nodes (`deletedNodeIds`) from `stores`, `groups` (and rules
 * within surviving groups), and `raw`, plus comments anchored to any removed
 * node. `header` passes through, except that the derived entry-point flags
 * are reconciled with the surviving groups. `startIr` is never mutated.
 *
 * The "what does this deletion set actually touch" resolution (including the
 * group→rules cascade) is shared with the text-splice carve path via
 * {@link resolveCarveCascade}, so the two paths can never semantically drift
 * apart on which nodes a given deletion removes.
 *
 * NOTE: store-slot item rewrites (the `<storeNodeId>#<index>` nul-filler path)
 * are NOT handled here — they are applied by {@link applyStoreSlotRemovals}
 * before this function (the caller partitions slot ids vs whole-node ids). Pass
 * the slot-removed IR as `startIr` to compose the two.
 *
 * @param startIr         Source-of-truth IR (never mutated).
 * @param deletedNodeIds Set of whole-node nodeIds the author marked for deletion.
 * @returns A fresh KeyboardIR with the deleted nodes filtered out.
 */
export function carveFilterIr(
  startIr: KeyboardIR,
  deletedNodeIds: ReadonlySet<string>,
): KeyboardIR {
  const cascade = resolveCarveCascade(startIr, deletedNodeIds);

  // FR-021 (T015): suppression-owned rules are never carve targets. A block
  // disposition rewrites the rule in place, and the carve deletion set still
  // names its nodeId (it WAS carved) — but the filter must not undo the
  // compiler's rewrite. The ownedByBehaviour stamp is the signal; allow-host
  // removals are already gone from the IR, so the filter simply finds nothing
  // for them (no double-removal). Group-level deletion still drops the whole
  // group (a stronger, explicit operation); the skip below only shields rules
  // in surviving groups.
  const ownedRuleIds = new Set<string>();
  for (const g of startIr.groups) {
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
      const comment = startIr.comments.find((c) => c.nodeId === commentId);
      const anchorNodeId = comment?.anchorRef?.nodeId;
      return anchorNodeId === undefined || !ownedRuleIds.has(anchorNodeId);
    }),
  );

  // Filter deleted groups; within surviving groups, filter deleted rules.
  const groups = startIr.groups
    .filter((g) => !cascade.deletedGroupIds.has(g.nodeId))
    .map((g) => {
      const filteredRules = g.rules.filter((r) => !deletedRuleIds.has(r.nodeId));
      // Only allocate a new group object when rules actually changed.
      if (filteredRules.length === g.rules.length) return g;
      return { ...g, rules: filteredRules };
    });

  // Filter deleted stores.
  const stores = startIr.stores.filter((s) => !cascade.deletedStoreIds.has(s.nodeId));

  return {
    ...startIr,
    header: reconcileHeaderSystemStores(
      reconcileEntryPoints(startIr.header, groups),
      startIr.stores,
      stores,
    ),
    stores,
    groups,
    // Raw fragments: filter out any deleted fragment nodes (including those
    // cascaded from their owning group); survivors are preserved so emit()'s
    // position-faithful path can interleave them.
    raw: startIr.raw.filter((f) => !cascade.deletedRawIds.has(f.nodeId)),
    // Comments anchored to a deleted node are dropped WITH it — previously
    // emit() dropped them only by accident (it never looks up a filtered-out
    // rule's nodeId); filtering here makes the drop deliberate and keeps this
    // path in lockstep with carveViaSplice's comment handling.
    comments: startIr.comments.filter((c) => !deletedCommentIds.has(c.nodeId)),
  };
}

/**
 * Clear the derived reserved-group entry-point flags whose group no longer
 * exists, mirroring how parse() derives them. `main` is sourced from the
 * `begin` directive, not from a group, so it passes through. Returns the
 * original header object when nothing changes.
 */
function reconcileEntryPoints(header: IRHeader, groups: readonly IRGroup[]): IRHeader {
  const ep = header.entryPoints;
  if (ep === undefined) return header;
  const names = new Set(groups.map((g) => g.name.toLowerCase()));
  const dropNewContext = ep.newContext === true && !names.has("newcontext");
  const dropPostKeystroke = ep.postKeystroke === true && !names.has("postkeystroke");
  if (!dropNewContext && !dropPostKeystroke) return header;

  const { newContext, postKeystroke, ...rest } = ep;
  const next: NonNullable<IRHeader["entryPoints"]> = {
    ...rest,
    ...(newContext === true && !dropNewContext ? { newContext } : {}),
    ...(postKeystroke === true && !dropPostKeystroke ? { postKeystroke } : {}),
  };
  const { entryPoints: _dropped, ...headerRest } = header;
  return Object.keys(next).length > 0 ? { ...headerRest, entryPoints: next } : headerRest;
}

/**
 * Reconcile the header fields parse() derives from system stores (name /
 * copyright / version / targets): deleting the backing store clears the
 * field. A re-parse of the spliced text re-derives these from the surviving
 * stores, so keeping the stale value would make the filtered IR disagree
 * with it (e.g. deleting store(&VERSION) must clear header.version).
 * Only fields whose source store was actually deleted are touched —
 * hand-built IRs may carry header values with no backing store, and those
 * pass through verbatim. Values are recomputed from the surviving stores'
 * items (plain quoted-string stores, the only shape these headers take,
 * round-trip exactly). Returns the original header object when nothing
 * changes.
 */
function reconcileHeaderSystemStores(
  header: IRHeader,
  startStores: readonly IRStore[],
  stores: readonly IRStore[],
): IRHeader {
  const deletedNames = new Set(
    startStores
      .filter((s) => s.isSystem && !stores.some((t) => t.nodeId === s.nodeId))
      .map((s) => s.name.toUpperCase()),
  );
  if (deletedNames.size === 0) return header;
  const textOf = (name: string): string | undefined => {
    const store = stores.find((s) => s.isSystem && s.name.toUpperCase() === name);
    if (store === undefined) return undefined;
    return store.items
      .map((it) => (it.kind === "char" ? it.value : it.kind === "raw" ? (it.text ?? "") : ""))
      .join("");
  };
  const next: Partial<IRHeader> = {};
  if (deletedNames.has("NAME")) next.name = textOf("NAME") ?? "";
  if (deletedNames.has("COPYRIGHT")) next.copyright = textOf("COPYRIGHT") ?? "";
  if (deletedNames.has("KEYBOARDVERSION") || deletedNames.has("VERSION")) {
    next.version = textOf("KEYBOARDVERSION") ?? textOf("VERSION") ?? "";
  }
  if (deletedNames.has("TARGETS")) {
    const raw = textOf("TARGETS");
    next.targets = raw ? raw.split(/\s+/).filter(Boolean) : [];
  }
  if (
    (next.name === undefined || next.name === header.name) &&
    (next.copyright === undefined || next.copyright === header.copyright) &&
    (next.version === undefined || next.version === header.version) &&
    (next.targets === undefined ||
      JSON.stringify(next.targets) === JSON.stringify(header.targets))
  ) {
    return header;
  }
  return { ...header, ...next };
}
