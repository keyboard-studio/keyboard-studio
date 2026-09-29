// editorMutate — carve/add editor-shell write helpers for the spec-014
// mutate() seam (US1, FR-006a).
//
// Routes the working carve IR derivation through the single mutate() write path
// (applyMutatePatch) instead of computing it ad hoc inside VFS projection.
//
// Declares CARVE_WRITES, ADD_GALLERY_WRITES, and TOUCH_WRITES — the IR arrays
// affected by each editor operation — and routes derived IR through
// applyMutatePatch so M2/M3 guarantees (path-scoped merge + declared-writes
// containment) apply consistently.
//
// Carve affects: groups[] (whole-group + rule deletion), stores[] (store
// deletion + store-slot item nul-rewrite), raw[] (raw-fragment deletion).
// header/comments are never touched.
//
// Patches are always computed from `baseIr`, never chained onto already-mutated
// IR, ensuring idempotency and reversibility.

import type { IRPath, KeyboardIR } from "@keyboard-studio/contracts";
import type { CarveDisposition } from "@keyboard-studio/contracts";
import { irPath, ARRAY_INDEX } from "@keyboard-studio/contracts";
import {
  parseSlotId,
  deriveCarvedIr,
  collectTaintedContributors,
} from "@keyboard-studio/engine";

import { applyMutatePatch } from "./mutateApply.ts";

/** Shared empty carved-character set for the `carveChars` default parameter. */
const EMPTY_CARVE_CHARS: ReadonlySet<string> = new Set();

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
 * Partition raw carve item ids into store-slot ids and whole-node item ids.
 * An id parses as a slot id AND its store exists in `baseIr` → a slot id (the
 * store-slot drop path). Anything else → a whole-node deletion.
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
    (parsed !== null && storeNodeIdSet.has(parsed.storeNodeId)
      ? slotIds
      : wholeNodeItemIds
    ).add(id);
  }
  return { slotIds, wholeNodeItemIds };
}

/**
/**
 * Options for the carve mutate path (T015): the suppression stage inputs.
 * When `dispositions` is non-empty, the shared engine pipeline
 * (suppression → slot removals → filter) derives the carve arrays; otherwise
 * the legacy slot-removals → filter derivation runs, content-identical.
 */
export interface CarveMutateOptions {
  /** Per-combination dispositions for the suppression stage (FR-019). */
  dispositions?: CarveDisposition[];
  /** A6 loud/soft for the suppression stage. Default false (soft). */
  loud?: boolean;
}

/**
 * Issue #1809, ruling §1: ONE aggregated carved set R, one nomination pass.
 *
 * The carve gallery discards characters one toggle at a time and unions the
 * per-character contributor records into the incremental `deletedItemIds`
 * set — but that union is NOT equivalent to a single aggregated-R pass for
 * whole-rule "no rows left" deletion and fully-tainted literal outputs (a
 * rule whose rows are tainted by two different carved characters is only
 * nominated by the aggregated pass). Every IR-projection consumer must run
 * this union so all of them consume the same pruned result.
 *
 * Returns a new set: `deletedItemIds` ∪ the aggregated pass's slot ids and
 * whole-rule ids. The aggregated pass's slot ids are always a subset of the
 * incremental union's (slot taint is per-slot); the whole-rule ids are the
 * net-new nominations the aggregated pass contributes.
 */
export function unionAggregatedCarveIds(
  baseIr: KeyboardIR,
  deletedItemIds: ReadonlySet<string>,
  carveChars: ReadonlySet<string>,
): Set<string> {
  if (carveChars.size === 0) return new Set(deletedItemIds);
  const aggregated = collectTaintedContributors(baseIr, carveChars);
  return new Set([
    ...deletedItemIds,
    ...aggregated.storeSlotIds,
    ...aggregated.ruleNodeIds,
  ]);
}

/**
 * Build the carve patch (the carve-affected IR arrays) from `baseIr` and the
 * current carve overlay.
 *
 * T015: when dispositions are provided, the shared engine pipeline
 * (deriveCarvedIr: suppression → slot removals → whole-node filter) derives
 * the arrays — byte-identical to the applyCarveToVfs pipeline path. Without
 * dispositions, the legacy derivation runs: slot-item nul-rewrites
 * (applyStoreSlotRemovals) first, then whole-node deletions (carveFilterIr).
 *
 * Always derived from `baseIr` so the patch is a pure function of the overlay
 * (idempotent + reversible). Returns `{}` (the empty, no-op patch) when there
 * are no deletions of any kind — keepAll/restoreAll collapse to this.
 *
 * `carveChars` (issue #1809, ruling §1): the aggregated carved character set;
 * the single aggregated-R pass is unioned over the incremental
 * `deletedItemIds` union (see {@link unionAggregatedCarveIds}).
 */
export function buildCarvePatch(
  baseIr: KeyboardIR,
  deletedNodeIds: ReadonlySet<string>,
  deletedItemIds: ReadonlySet<string>,
  carveChars: ReadonlySet<string> = EMPTY_CARVE_CHARS,
  opts?: CarveMutateOptions,
): Partial<KeyboardIR> {
  const effectiveItemIds = unionAggregatedCarveIds(
    baseIr,
    deletedItemIds,
    carveChars,
  );
  const { slotIds, wholeNodeItemIds } = partitionItemIds(
    baseIr,
    effectiveItemIds,
  );
  const dispositions = opts?.dispositions ?? [];

  if (
    deletedNodeIds.size === 0 &&
    slotIds.size === 0 &&
    wholeNodeItemIds.size === 0 &&
    dispositions.length === 0
  ) {
    return {};
  }

  // T015: the shared pipeline. With empty dispositions the suppression stage
  // is a structural no-op and the result is content-identical to the legacy
  // derivation below. deletedItemIds carries the #1809 §1 aggregated union
  // (effectiveItemIds) so the pipeline and the legacy derivation consume the
  // same pruned result.
  const { ir: carved } = deriveCarvedIr(baseIr, {
    deletedNodeIds,
    deletedItemIds: effectiveItemIds,
    dispositions,
    ...(opts?.loud === true ? { loud: true as const } : {}),
  });

  return {
    groups: carved.groups,
    stores: carved.stores,
    raw: carved.raw,
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
 * @param opts            Optional suppression inputs (T015: dispositions + loud).
 * @param carveChars      Issue #1809, ruling §1: the aggregated carved character
 *                        set; unioned over `deletedItemIds` (see buildCarvePatch).

 * @returns A fresh KeyboardIR with carve deletions applied.
 */
export function applyCarveMutate(
  baseIr: KeyboardIR,
  deletedNodeIds: ReadonlySet<string>,
  deletedItemIds: ReadonlySet<string>,
  carveChars: ReadonlySet<string> = EMPTY_CARVE_CHARS,
  opts?: CarveMutateOptions,
): KeyboardIR {
  const patch = buildCarvePatch(
    baseIr,
    deletedNodeIds,
    deletedItemIds,
    carveChars,
    opts,
  );

  return applyMutatePatch(baseIr, patch, CARVE_WRITES);
}

// ---------------------------------------------------------------------------
// Touch re-propagation write surface — spec-014 US2 foundation (next cycle)
// ---------------------------------------------------------------------------

/**
 * The touch write surface — the IR location touch re-propagation (US2) may
 * rewrite. Used by `repropagate.ts` to route `touchSuggest`-derived patches
 * through `applyMutatePatch` with M2/M3 guarantees.
 *
 * Touch keys live at `touchLayout.platforms[].layers[].rows[].keys[]`. The
 * `keys[]` array is the addressable endpoint (a path that resolves to a
 * `TouchKeyIR` — per-key `sk`/`flick`/`multitap` sub-trees are written as a unit).
 * Declaring the path at `keys` authorizes both whole-array replace and per-element
 * writes under the prefix-containment rule.
 *
 * `touchLayout.nodeIds` is also included: re-suggesting touch keys re-derives
 * the platform+layer+key → nodeId map alongside the keys. It stays a separate
 * declared path (not a coarse `touchLayout` grant) so the containment guard keeps
 * unrelated siblings out of bounds.
 */
export const TOUCH_WRITES: readonly IRPath[] = [
  irPath(
    "touchLayout",
    "platforms",
    ARRAY_INDEX,
    "layers",
    ARRAY_INDEX,
    "rows",
    ARRAY_INDEX,
    "keys",
    ARRAY_INDEX,
  ),
  irPath("touchLayout", "nodeIds", ARRAY_INDEX),
];

// ---------------------------------------------------------------------------
// Add galleries (mechanism assignment) — T017
// ---------------------------------------------------------------------------

/**
 * The add-gallery write surface — the physical assignment IR targets only.
 *
 * applyAssignmentsToVfs injects two kinds of IR-bearing content:
 *   - user `store(...)` declarations (non-&, hoisted before `begin`) → `stores[]`
 *   - `group(<name>)` blocks and rules (merged by name / appended)    → `groups[]`
 *
 * System stores (&-prefixed `header` fields) are skipped, so `header` is not
 * a write target. Keycap-label and touch-layout projection are deferred to US2.
 */
export const ADD_GALLERY_WRITES: readonly IRPath[] = [
  irPath("groups", ARRAY_INDEX),
  irPath("stores", ARRAY_INDEX),
];

/**
 * Build the add-gallery patch: the physical-assignment IR arrays (`groups`,
 * `stores`) from the assignment-injected IR.
 */
export function buildAddGalleryPatch(
  assignedIr: KeyboardIR,
): Partial<KeyboardIR> {
  return {
    groups: assignedIr.groups,
    stores: assignedIr.stores,
  };
}

/**
 * Route the add-gallery (mechanism assignment) IR derivation through the single
 * mutate() write path. Routes the physical-assignment arrays through
 * applyMutatePatch / {@link ADD_GALLERY_WRITES} so the mutate() path is the
 * canonical IR producer (M6) and the containment guard (M3) prevents writes to
 * `header`, comments, or deferred keycap/touch targets.
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

// ---------------------------------------------------------------------------
// Deadkey lifecycle editors (spec 083) — T-phase 3
// ---------------------------------------------------------------------------

/**
 * The deadkey-lifecycle write surface — the IR arrays a deadkey define /
 * rename / retarget / delete / pair-edit may rewrite.
 *
 * The engine's deadkey-lifecycle mutations (packages/engine) touch only
 * rules (trigger, fan-out, escape) and the two fan-out stores; the author
 * name rides the trigger rule's `trailingComment`, which lives inside
 * `groups[]` as well. Named deadkeys (id null, pre-FR-004) live as opaque
 * `raw[]` fragments — their delete/retarget rewrites those fragments, so
 * `raw[]` is in scope too. `header`, `comments`, and `touchLayout` are
 * never touched, so a patch reaching them fails the M3 containment check.
 *
 * Mirrors ADD_GALLERY_WRITES (same arrays — deadkeys are IR entities,
 * not session answers).
 */
export const DEADKEY_WRITES: readonly IRPath[] = [
  irPath("groups", ARRAY_INDEX),
  irPath("stores", ARRAY_INDEX),
  irPath("raw", ARRAY_INDEX),
];
