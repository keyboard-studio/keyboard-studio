// carvePipeline — the composed carve IR pipeline (T015, spec 076 FR-019).
//
// Single definition of the carve IR derivation, shared by:
//   - applyCarveToVfs (engine: the live OSK / output pipeline), and
//   - the studio editorMutate seam (buildCarvePatch / applyCarveMutate),
// so both derive byte-identical carved IRs from the same inputs.
//
// Pipeline order (load-bearing — do not reorder):
//   1. Suppression — compileCarveSuppression runs on the PRE-carve IR.
//      (T013 constraint: guard selector chars are read from the pre-removal
//      stores and are unrecoverable after applyStoreSlotRemovals drops them.
//      This is why suppression runs FIRST, not last: the task text's
//      "filter → slot removals → suppression" order would starve the guard
//      synthesis of its selector chars.)
//   2. Slot removals — applyStoreSlotRemovals drops carved store slots on the
//      suppressed IR; a store left empty is removed with the rules that
//      reference it (re-derived from the start IR each time, so un-carve
//      needs no restoration record for this stage). Suppression-owned guard rules
//      are rules, not store entries, so they are unaffected.
//   4. Deadkey prune — a deadkey the carve left unconsumed (consumed
//      in the start IR, by nothing in the carved IR) is stripped from every output (see carveDeadkeyPrune.ts).
//   3. Whole-node filter — carveFilterIr drops deleted nodes. Rules carrying
//      ownedByBehaviour (suppression output) are never filter targets: the
//      filter must not undo the compiler's in-place block rewrite, and
//      allow-host removals are already gone (no double-removal).

import type { FallbackPolicy, KeyboardIR } from "@keyboard-studio/contracts";
import { compileCarveSuppression } from "./carveSuppression.js";
import { dispositionsForFallbackPolicy } from "./fallbackPolicy.js";
import { applyStoreSlotRemovals, type CascadedSlotRemoval } from "./applyStoreSlotRemovals.js";
import { carveFilterIr } from "./carveFilterIr.js";
import { pruneCarveUnusedDeadkeys } from "./carveDeadkeyPrune.js";
import { parseSlotId } from "./slotId.js";

/**
 * Inputs to the composed carve pipeline.
 *
 * - `deletedNodeIds`  — whole-node carve deletions (group/rule/store/raw nodeIds).
 * - `deletedItemIds`  — glyph-level carve item ids (store-slot `<storeNodeId>#<index>`
 *                       ids plus bare rule/store nodeIds).
 * - `fallbackPolicy`  — the keyboard-wide fallback policy for the suppression
 *                       stage (FR-019, retired per-carve override). It is expanded
 *                       over the carved combo ids (deletedNodeIds + deletedItemIds):
 *                       swallow → block, pass-through → allow-host (deadkey carves
 *                       still suppress). Omitted means "no suppression": the
 *                       pipeline degrades to the legacy slot-removals → filter
 *                       behavior, content-identical.
 * - `loud`            — A6 loud/soft for the suppression stage. Default false
 *                       (soft); follows the A6 survey answer when it exists (FR-009).
 */
export interface CarvePipelineInput {
  deletedNodeIds: ReadonlySet<string>;
  deletedItemIds: ReadonlySet<string>;
  fallbackPolicy?: FallbackPolicy;
  /**
   * Ids in the deletion sets that are plain removals, not carves (e.g. rules
   * of a disabled family). They are excluded from the policy expansion, so
   * they are filtered out rather than rewritten into suppression rules.
   */
  suppressionExemptIds?: ReadonlySet<string>;
  loud?: boolean;
}

export interface CarvePipelineResult {
  ir: KeyboardIR;
  warnings: string[];
  /**
   * Informational slot-removal messages, e.g. which rules were removed because
   * every slot of a store they reference was carved. Never a problem.
   */
  notices: string[];
  /**
   * Partner characters the slot-removal stage dropped only because they are
   * positionally paired with a slot the author chose (see
   * {@link CascadedSlotRemoval}). Empty when no carve reached a paired store.
   */
  cascadedRemovals: CascadedSlotRemoval[];
}

/**
 * Partition glyph-level carve item ids into store-slot ids and whole-node ids.
 * An id parses as a slot id AND its store exists in `ir` → a slot id (the
 * store-slot drop path). Anything else → a whole-node deletion. Shared by the
 * pipeline and (via re-export) any caller that needs the same partition.
 */
export function partitionCarveItemIds(
  ir: KeyboardIR,
  deletedItemIds: ReadonlySet<string>,
): { slotIds: Set<string>; wholeNodeItemIds: Set<string> } {
  const storeNodeIdSet = new Set(ir.stores.map((s) => s.nodeId));
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
 * Derive the carved IR from `startIr` and the carve overlay.
 *
 * Runs suppression → slot removals → whole-node filter (see the file header
 * for why this order is load-bearing). `startIr` is never mutated. The result
 * is content-identical to the legacy (pre-suppression) pipeline when
 * `fallbackPolicy` is omitted.
 */
export function deriveCarvedIr(
  startIr: KeyboardIR,
  input: CarvePipelineInput,
): CarvePipelineResult {
  const dispositions =
    input.fallbackPolicy === undefined
      ? []
      : dispositionsForFallbackPolicy(
          input.fallbackPolicy,
          [...input.deletedNodeIds, ...input.deletedItemIds].filter(
            (id) => input.suppressionExemptIds?.has(id) !== true,
          ),
        );

  // Stage 1 — suppression on the PRE-carve IR (T013 constraint).
  const suppressed = compileCarveSuppression(
    startIr,
    dispositions,
    input.loud === true ? { loud: true } : {},
  );

  // Stage 2 — slot removals on the suppressed IR. The suppression compiler
  // never touches stores, so partitioning against the suppressed IR is
  // equivalent to partitioning against startIr. Carve-scoped `notany()`
  // hygiene (issue #1809, ruling §3): tainted chars are pruned from
  // `notany()` stores instead of blocking — this pipeline is the carve
  // apply path, so it opts in like every other carve slot-removal call.
  const { slotIds, wholeNodeItemIds } = partitionCarveItemIds(
    suppressed.ir,
    input.deletedItemIds,
  );
  const removalResult = applyStoreSlotRemovals(suppressed.ir, slotIds, {
    carveNotAnyHygiene: true,
  });

  // Stage 3 — whole-node filter. carveFilterIr skips suppression-owned rules
  // (FR-021): a block disposition rewrote the rule in place and the deletion
  // set still names its nodeId, but the filter must not undo the rewrite.
  const allWholeNodeIds = new Set([
    ...input.deletedNodeIds,
    ...wholeNodeItemIds,
  ]);
  const filtered = carveFilterIr(removalResult.ir, allWholeNodeIds);

  // Stage 4 — prune deadkeys the carve left unconsumed (and the arming rules
  // that only existed to set them). Runs last so it sees every removal.
  const pruned = pruneCarveUnusedDeadkeys(startIr, filtered, {
    swallow: input.fallbackPolicy === "swallow",
    loud: input.loud === true,
  });

  return {
    ir: pruned.ir,
    warnings: removalResult.warnings,
    notices: [...removalResult.notices, ...pruned.notices],
    cascadedRemovals: removalResult.cascaded,
  };
}
