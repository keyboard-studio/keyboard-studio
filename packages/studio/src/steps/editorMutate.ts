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

// ---------------------------------------------------------------------------
// Add galleries (mechanism assignment) — T017
// ---------------------------------------------------------------------------

/**
 * The add-gallery write surface — the PHYSICAL assignment IR targets only.
 *
 * applyAssignmentsToVfs injects exactly two kinds of IR-bearing content into the
 * .kmn:
 *   - user `store(...)` declarations (non-&, hoisted before `begin`) → `stores[]`
 *   - `group(<name>)` blocks and rules (merged by name / appended)    → `groups[]`
 *
 * System stores (&-prefixed `header` fields) are explicitly skipped by the
 * injector, so `header` is NOT a write target. Keycap-label and touch-layout
 * projection are DEFERRED to US2 and are therefore NOT in this surface.
 */
export const ADD_GALLERY_WRITES: readonly IRPath[] = [
  irPath("groups", ARRAY_INDEX),
  irPath("stores", ARRAY_INDEX),
];

/**
 * Build the add-gallery patch: the physical-assignment IR arrays (`groups`,
 * `stores`) taken from the assignment-injected IR.
 *
 * `assignedIr` is the IR parsed back from the .kmn AFTER applyAssignmentsToVfs
 * has injected the selected patterns (i.e. the carved IR with mechanisms added).
 * Only `groups` and `stores` are taken — the physical assignment targets.
 */
export function buildAddGalleryPatch(assignedIr: KeyboardIR): Partial<KeyboardIR> {
  return {
    groups: assignedIr.groups,
    stores: assignedIr.stores,
  };
}

/**
 * Route the add-gallery (mechanism assignment) IR derivation through the single
 * mutate() write path.
 *
 * The reference emit for the add path is text-based (applyAssignmentsToVfs writes
 * the injected .kmn directly, byte-identical in both flag states). This helper is
 * the IR-projection seam: given the carved `baseIr` and the assignment-injected
 * `assignedIr` (parsed back from that .kmn), it routes the physical-assignment
 * arrays through applyMutatePatch / {@link ADD_GALLERY_WRITES} so the mutate()
 * path is the canonical IR producer (M6/SC-001) and the containment guard (M3)
 * applies to the add write too — it never reaches `header`, comments, or the
 * deferred keycap/touch targets.
 *
 * @param baseIr      The carved working IR the assignment was applied onto.
 * @param assignedIr  The IR after mechanism injection (parsed from the .kmn).
 * @returns A fresh IR whose groups/stores are the assignment-injected ones.
 */
export function applyAddGalleryMutate(
  baseIr: KeyboardIR,
  assignedIr: KeyboardIR,
): KeyboardIR {
  const patch = buildAddGalleryPatch(assignedIr);
  return applyMutatePatch(baseIr, patch, ADD_GALLERY_WRITES);
}
