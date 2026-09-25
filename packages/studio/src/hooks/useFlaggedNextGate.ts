// useFlaggedNextGate — blocks a step's Next while an EARLIER screen has an
// unresolved flag (spec 079 US3 T046/T080, FR-013).
//
// Shared by every multi-screen step that surfaces flagged answers (marks
// today; characters/punctuation/invisibles/convenience per T080), so there is
// ONE gate implementation rather than four that could disagree about "before
// the position" or about never moving `position` itself (FR-004 — this hook
// only READS position, it never writes it).

import { useMemo } from "react";
import type { WorkItem } from "../steps/workToDo.ts";

export interface FlaggedNextGateResult {
  /** True while an unresolved flagged screen sits before the current position. */
  readonly blocked: boolean;
  /** The flagged items on screens strictly before `position`, in walk order. */
  readonly flaggedBefore: readonly WorkItem[];
}

/**
 * @param items         this step's `reproposed` work items (from `selectWorkToDo()`).
 * @param screenOrder   the step's screens in walk order (e.g. `visibleStations`).
 * @param position      the author's current screen id within the step.
 */
export function computeFlaggedNextGate(
  items: readonly WorkItem[],
  screenOrder: readonly string[],
  position: string | null,
): FlaggedNextGateResult {
  // An unresolved/unknown position (author not yet placed inside the walk) is
  // treated as the very first screen: nothing precedes it, so nothing blocks.
  const rawIndex = position !== null ? screenOrder.indexOf(position) : -1;
  const positionIndex = rawIndex === -1 ? 0 : rawIndex;
  const flaggedBefore = items.filter((item) => {
    if (item.kind !== "reproposed") return false;
    const screenIndex = screenOrder.indexOf(item.screenId);
    // A flagged screen not in THIS step's walk belongs to a different step —
    // never gates this one.
    if (screenIndex === -1) return false;
    return screenIndex < positionIndex;
  });
  return { blocked: flaggedBefore.length > 0, flaggedBefore };
}

/** React-memoized wrapper over {@link computeFlaggedNextGate}. */
export function useFlaggedNextGate(
  items: readonly WorkItem[],
  screenOrder: readonly string[],
  position: string | null,
): FlaggedNextGateResult {
  return useMemo(() => computeFlaggedNextGate(items, screenOrder, position), [items, screenOrder, position]);
}
