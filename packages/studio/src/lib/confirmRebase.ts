// confirmRebase — shared re-base guard for onInstantiate callbacks.
//
// Reads live store state at call time (via useWorkingCopyStore.getState()) to
// avoid the stale-closure problem: the callback is memoised with useCallback,
// but by the time an async compile completes the render-time values of
// isInstantiated / deletedNodeIds / phaseResults may be stale. Calling
// getState() inside the guard reads the current Zustand snapshot instead.
//
// Returns true  — proceed with instantiation (no edits, or user confirmed).
// Returns false — abort (user cancelled the confirm dialog).

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
