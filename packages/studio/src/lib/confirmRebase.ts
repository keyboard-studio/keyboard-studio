// confirmRebase — shared re-base guard and onInstantiate helper.
//
// Reads live store state at call time (via useWorkingCopyStore.getState()) to
// avoid the stale-closure problem: the callback is memoised with useCallback,
// but by the time an async compile completes the render-time values of
// isInstantiated / deletedNodeIds / phaseResults may be stale. Calling
// getState() inside the guard reads the current Zustand snapshot instead.
//
// confirmRebaseIfEdited:
//   Returns true  — proceed with instantiation (no edits, or user confirmed).
//   Returns false — abort (user cancelled the confirm dialog).
//
// instantiateFromBaseIfConfirmed:
//   Shared body for onInstantiate callbacks in PreviewShell and SurveyView.
//   Guards on ir/vfs availability, calls confirmRebaseIfEdited, then dispatches
//   instantiateFromBase. Both callers have identical behavior, so a single
//   shared implementation eliminates the duplication and ensures the guard
//   logic stays in sync.

import type { BaseKeyboard, VirtualFS, KeyboardIR } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

export function confirmRebaseIfEdited(): boolean {
  const s = useWorkingCopyStore.getState();
  const hasEdits =
    s.isInstantiated() &&
    (s.deletedNodeIds.size > 0 || s.phaseResults.length > 0);

  if (!hasEdits) return true;

  return window.confirm(
    "Switching base keyboards will discard your current edits (carve deletions and survey answers). Continue?",
  );
}

/**
 * Shared onInstantiate body for PreviewShell and SurveyView.
 *
 * Guards that `ir` and `vfs` are non-null (mock-engine path), runs
 * {@link confirmRebaseIfEdited} (reads live store state to avoid stale-closure
 * issues), then calls `instantiateFromBase` from the store.
 *
 * Returns true when instantiation proceeded, false when it was skipped (mock
 * engine path or user cancelled the rebase confirm).
 */
export function instantiateFromBaseIfConfirmed(
  base: BaseKeyboard,
  { vfs, ir }: { vfs: VirtualFS | null; ir: KeyboardIR | null },
): boolean {
  if (ir === null || vfs === null) {
    console.warn("[studio] instantiate skipped: no parsed IR (mock engine?)");
    return false;
  }
  if (!confirmRebaseIfEdited()) return false;
  useWorkingCopyStore.getState().instantiateFromBase(base, { vfs, ir });
  return true;
}
