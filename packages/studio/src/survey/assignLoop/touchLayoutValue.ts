// touchLayoutValue — the touch-layout decision's value and its
// derivation from the working copy's key-edit overlay (spec 090
// T042, execution shape D-090-38).
//
// The value type lives here, in the assign-loop feature home (the
// D-090-8 pattern — carveValue.ts, physicalLayoutValue.ts): the
// gallery module (survey/questions/gallery/touchLayout.ts) may not
// import stores, so the shape it re-exports is declared beside the
// state it snapshots. `currentTouchLayoutValue()` is shared by
// AddTouchAdapter's completion recording and the module's decision
// renderer so the two surfaces never compute different values.

import type { KeyEditOperation } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";

/** The touch-layout decision value (data-model.md). */
export interface TouchLayoutValue {
  ops: KeyEditOperation[];
  deletedTouchKeyIds: string[];
}

/**
 * Build the decision value from an overlay snapshot.
 *
 * The ops are the author's key-edit operations in append order —
 * spec 014's model: suggested keys appear as the ops that created
 * them, hand-set keys as the ops that set them, so replaying the
 * list reproduces the overlay exactly (the R6 refresh/survival
 * behaviour is a property of the ops themselves, not of extra
 * provenance — per-key provenance keeps spec 014's vocabulary,
 * carried inside the ops). `deletedTouchKeyIds` is the store's
 * deletion set as a list, in deletion (insertion) order.
 *
 * Both lists are copied; op objects are shared with the overlay
 * (ops are immutable — the overlay only ever appends or truncates).
 */
export function touchLayoutValueFromSnapshot(
  ops: readonly KeyEditOperation[],
  deletedTouchKeyIds: Iterable<string>,
): TouchLayoutValue {
  return { ops: [...ops], deletedTouchKeyIds: [...deletedTouchKeyIds] };
}

/** The touch-layout value from the live working copy. */
export function currentTouchLayoutValue(): TouchLayoutValue {
  const s = useWorkingCopyStore.getState();
  return touchLayoutValueFromSnapshot(s.keyEditOverlay.ops, s.deletedTouchKeyIds);
}
