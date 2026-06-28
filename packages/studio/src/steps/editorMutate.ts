// editorMutate — the carve/add editor-shell write helpers for the spec-014
// mutate() seam (US1, FR-006a).
//
// The carve overlay (workingCopyStore deletedNodeIds / deletedItemIds) stays as
// reversible UI state. What changes under the flag is that the PROJECTION /
// DERIVATION of the working carve IR goes through the single mutate() write path
// (applyMutatePatch) instead of being computed ad hoc inside the VFS projection.
//
// This module is the steps-layer carve adapter:
//   - It depends only on the engine (carveFilterIr, applyStoreSlotRemovals,
//     parseSlotId) and the local mutateApply helper — NOT on stores/ or lib/
//     (steps-layer depcruise boundary). The caller passes `baseIr` as a param.
//   - It declares CARVE_WRITES — the carve-affected IR arrays (groups, stores,
//     raw) — and routes the derived IR through applyMutatePatch so the M2/M3
//     guarantees (path-scoped merge + declared-writes containment) apply to the
//     carve write exactly as they do to the per-question writes.
//
// Carve affects exactly: groups[] (whole-group + rule deletion), stores[] (store
// deletion + store-slot item nul-rewrite), raw[] (raw-fragment deletion).
// header/comments are never touched.
//
// CRITICAL (idempotency / reversibility): the patch is ALWAYS computed from
// `baseIr`, never chained onto an already-mutated IR. Restoring (a shrinking
// deletion set) therefore yields fewer deletions and keepAll/restoreAll → empty
// deletion sets → an empty patch → a structural copy of baseIr.

import type { IRPath, KeyboardIR } from "@keyboard-studio/contracts";
import { irPath, ARRAY_INDEX } from "@keyboard-studio/contracts";
import { carveFilterIr, applyStoreSlotRemovals, parseSlotId } from "@keyboard-studio/engine";
import { applyMutatePatch } from "./mutateApply.ts";

/**
 * The carve write surface — the IR arrays carve deletions may rewrite.
 *
 * - `groups[]` — whole-group deletion + rule deletion within a surviving group.
 * - `stores[]` — whole-store deletion + store-slot item nul-rewrite.
 * - `raw[]`    — raw-fragment deletion.
 *
 * `header` and `comments` are intentionally absent: carve never touches them, so
 * a patch reaching either fails the M3 containment check (a correctness guard).
 */
export const CARVE_WRITES: readonly IRPath[] = [
  irPath("groups", ARRAY_INDEX),
  irPath("stores", ARRAY_INDEX),
  irPath("raw", ARRAY_INDEX),
];

/**
 * Partition raw carve item ids into store-slot ids and whole-node item ids,
 * exactly as projectWorkingCopyVfs does, so the seam path is behavior-identical
 * to the legacy VFS path.
 *
 * An id parses as a slot id AND its store exists in `baseIr` → a slot id (the
 * nul-filler rewrite path). Anything else (a bare rule/store nodeId, or a
 * slot-shaped id whose store is absent) → a whole-node deletion.
 */
function partitionItemIds(
  baseIr: KeyboardIR,
  deletedItemIds: ReadonlySet<string>,
): { slotIds: Set<string>; wholeNodeItemIds: Set<string> } {
  const storeNodeIdSet = new Set(baseIr.stores.map((s) => s.nodeId));
  const slotIds = new Set<string>();
  const wholeNodeItemIds = new Set<string>();
  for (const id of deletedItemIds) {
    const parsed = parseSlotId(id);
    if (parsed !== null && storeNodeIdSet.has(parsed.storeNodeId)) {
      slotIds.add(id);
    } else {
      wholeNodeItemIds.add(id);
    }
  }
  return { slotIds, wholeNodeItemIds };
}

/**
 * Build the carve patch (the carve-affected IR arrays) from `baseIr` and the
 * current carve overlay. Slot-item nul-rewrites are applied first
 * (applyStoreSlotRemovals), then whole-node deletions (carveFilterIr); the
 * result's carve arrays become the patch.
 *
 * Always derived from `baseIr` so the patch is a pure function of the overlay
 * (idempotent + reversible). Returns `{}` (the empty, no-op patch) when there
 * are no deletions of any kind — keepAll/restoreAll collapse to this.
 */
export function buildCarvePatch(
  baseIr: KeyboardIR,
  deletedNodeIds: ReadonlySet<string>,
  deletedItemIds: ReadonlySet<string>,
): Partial<KeyboardIR> {
  const { slotIds, wholeNodeItemIds } = partitionItemIds(baseIr, deletedItemIds);

  // No deletions of any kind → empty patch (M5 no-op → structural copy of base).
  if (deletedNodeIds.size === 0 && slotIds.size === 0 && wholeNodeItemIds.size === 0) {
    return {};
  }

  // 1. Store-slot nul-rewrite (alignment-preserving; never splices items).
  const slotResult = applyStoreSlotRemovals(baseIr, slotIds);
  const slotIr = slotResult.ir; // === baseIr when slotIds was empty / all rejected

  // 2. Whole-node deletion (groups/rules/stores/raw) on the slot-rewritten IR.
  const allWholeNodeIds = new Set([...deletedNodeIds, ...wholeNodeItemIds]);
  const filtered = carveFilterIr(slotIr, allWholeNodeIds);

  // The patch is the carve-affected arrays only. Arrays replace wholesale under
  // the deep merge, so writing the filtered arrays produces the carved IR while
  // leaving header/comments/touchLayout/visualKeyboard/etc. untouched (M2).
  return {
    groups: filtered.groups,
    stores: filtered.stores,
    raw: filtered.raw,
  };
}

/**
 * Derive the carve working IR by routing the carve patch through the single
 * mutate() write path (applyMutatePatch with {@link CARVE_WRITES}).
 *
 * `baseIr` is never mutated (M1). The returned IR differs from `baseIr` only at
 * the carve arrays (M2), and the patch is checked against CARVE_WRITES (M3). An
 * empty overlay → empty patch → structural copy of `baseIr` (M5).
 *
 * @param baseIr          The source-of-truth carve IR. Never mutated.
 * @param deletedNodeIds  Whole-node carve deletions (group/rule/store/raw nodeIds).
 * @param deletedItemIds  Glyph-level carve item ids (store slots + bare node ids).
 * @returns A fresh KeyboardIR with carve deletions applied.
 */
export function applyCarveMutate(
  baseIr: KeyboardIR,
  deletedNodeIds: ReadonlySet<string>,
  deletedItemIds: ReadonlySet<string>,
): KeyboardIR {
  const patch = buildCarvePatch(baseIr, deletedNodeIds, deletedItemIds);
  return applyMutatePatch(baseIr, patch, CARVE_WRITES);
}
