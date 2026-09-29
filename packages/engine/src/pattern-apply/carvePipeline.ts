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
//   2. Slot removals — applyStoreSlotRemovals replaces carved store slots
//      with nul fillers on the suppressed IR. Suppression-owned guard rules
//      are rules, not store entries, so they are unaffected.
//   3. Whole-node filter — carveFilterIr drops deleted nodes. Rules carrying
//      ownedByBehaviour (suppression output) are never filter targets: the
//      filter must not undo the compiler's in-place block rewrite, and
//      allow-host removals are already gone (no double-removal).

import type { CarveDisposition, KeyboardIR } from "@keyboard-studio/contracts";
import { compileCarveSuppression } from "./carveSuppression.js";
import { applyStoreSlotRemovals } from "./applyStoreSlotRemovals.js";
import { carveFilterIr } from "./carveFilterIr.js";
import { parseSlotId } from "./slotId.js";

/**
 * Inputs to the composed carve pipeline.
 *
 * - `deletedNodeIds`  — whole-node carve deletions (group/rule/store/raw nodeIds).
 * - `deletedItemIds`  — glyph-level carve item ids (store-slot `<storeNodeId>#<index>`
 *                       ids plus bare rule/store nodeIds).
 * - `dispositions`    — per-combination carve dispositions for the suppression
 *                       stage (FR-019). Empty (or omitted) means "no suppression":
 *                       the pipeline degrades to the legacy slot-removals → filter
 *                       behavior, content-identical.
 * - `loud`            — A6 loud/soft for the suppression stage. Default false
 *                       (soft); follows the A6 survey answer when it exists (FR-009).
 */
export interface CarvePipelineInput {
  deletedNodeIds: ReadonlySet<string>;
  deletedItemIds: ReadonlySet<string>;
  dispositions?: CarveDisposition[];
  loud?: boolean;
}

export interface CarvePipelineResult {
  ir: KeyboardIR;
  warnings: string[];
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
 * Derive the carved IR from `baseIr` and the carve overlay.
 *
 * Runs suppression → slot removals → whole-node filter (see the file header
 * for why this order is load-bearing). `baseIr` is never mutated. The result
 * is content-identical to the legacy (pre-suppression) pipeline when
 * `dispositions` is empty or omitted.
 */
export function deriveCarvedIr(
  baseIr: KeyboardIR,
  input: CarvePipelineInput,
): CarvePipelineResult {
  const dispositions = input.dispositions ?? [];

  // Stage 1 — suppression on the PRE-carve IR (T013 constraint).
  const suppressed = compileCarveSuppression(
    baseIr,
    dispositions,
    input.loud === true ? { loud: true } : {},
  );

  // Stage 2 — slot removals on the suppressed IR. The suppression compiler
  // never touches stores, so partitioning against the suppressed IR is
  // equivalent to partitioning against baseIr. Carve-scoped `notany()`
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

  return { ir: filtered, warnings: removalResult.warnings };
}
