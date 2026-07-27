// confirmRebase — shared re-base guard and onInstantiate helper.
//
// Reads live store state at call time (via useWorkingCopyStore.getState()) to
// avoid the stale-closure problem: the callback is memoised with useCallback,
// but by the time an async compile completes the render-time values of
// isInstantiated / deletedNodeIds / phaseResults may be stale. Calling
// getState() inside the guard reads the current Zustand snapshot instead.
//
// hasUnsavedEdits:
//   Pure predicate — true when the working copy is instantiated AND carries
//   edits (carve deletions / recorded survey phases / flagged chars) that a
//   re-instantiation would discard. Shared by confirmRebaseIfEdited (below)
//   and needsRebaseConfirm (the SAME-base-aware variant used by SurveyView's
//   synchronous confirm-click guard — see BaseResolutionAdapter.onConfirm in
//   editors/adapters/panelAdapters.tsx).
//
// confirmRebaseIfEdited:
//   Returns true  — proceed with instantiation (no edits, or user confirmed).
//   Returns false — abort (user cancelled the confirm dialog).
//   Used by callers with NO synchronous "confirm" affordance of their own —
//   i.e. usePreviewArtifact's onInstantiate, which fires from a decoupled
//   async compile-settle, not a button click. Those callers already skip
//   calling this at all when the incoming base id matches the currently
//   instantiated one (see usePreviewArtifact.ts), so this function does not
//   need to be base-id-aware itself.
//
// needsRebaseConfirm / confirmRebaseTo:
//   The SAME-base-aware variants (F1 fix). `needsRebaseConfirm` never prompts
//   for a re-confirm of the SAME base id — re-instantiating the same base is a
//   no-op at the store layer (workingCopyStore's resolveInstantiationCase),
//   never a discard, however much the working copy has been edited.
//   `confirmRebaseTo` combines the predicate with the actual window.confirm
//   call. SurveyView's BaseResolutionAdapter.onConfirm calls confirmRebaseTo
//   SYNCHRONOUSLY, inside the click handler, BEFORE flipping baseConfirmed /
//   calling onComplete — window.confirm is itself synchronous, so a Cancel can
//   still prevent the wizard from advancing at all (an after-the-fact effect,
//   by contrast, cannot un-advance a wizard step that already committed).
//
// instantiateFromBaseIfConfirmed:
//   Shared body for onInstantiate callbacks in PreviewShell and SurveyView.
//   Guards on ir/vfs availability, calls confirmRebaseIfEdited (unless the
//   caller passes `skipConfirm: true` — see the `options` param doc below),
//   then dispatches instantiateFromBase.

import type { BaseKeyboard, RemovalCapability, VirtualFS, KeyboardIR } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

/** User-facing wording for the rebase confirm dialog — the single source of truth for the string. */
export const REBASE_CONFIRM_MESSAGE =
  "Switching base keyboards will discard your current edits (carve deletions and survey answers). Continue?";

export function hasUnsavedEdits(): boolean {
  const s = useWorkingCopyStore.getState();
  // sequenceFlaggedChars: historically, flagging a char (Mechanism Gallery
  // S-03) was a real edit even though it recorded no MechanismAssignment.
  // flagCharForSequence is no longer called from any UI path (see
  // workingCopyStore), so this list is always empty in practice — the
  // membership check below is a harmless no-op, kept rather than removed
  // since the underlying sequenceFlaggedChars/flagCharForSequence state is
  // itself dead code deliberately deferred, not yet stripped.
  // deletedItemIds is a known separate gap, not addressed here.
  return (
    s.isInstantiated() &&
    (s.deletedNodeIds.size > 0 ||
      s.phaseResults.length > 0 ||
      s.sequenceFlaggedChars.length > 0)
  );
}

export function confirmRebaseIfEdited(): boolean {
  if (!hasUnsavedEdits()) return true;
  return window.confirm(REBASE_CONFIRM_MESSAGE);
}

/**
 * Pure predicate (no window.confirm): would committing `newBaseId` right now
 * discard edits? Always false when `newBaseId` matches the currently
 * instantiated base — a same-base re-confirm is never a discard (see the
 * module doc above).
 *
 * Deliberately NOT `instantiationMode`-aware: `resolveInstantiationCase` in
 * `stores/workingCopyStore.ts` (~lines 602-634) treats a same-id but
 * different-`instantiationMode` re-pick as a genuine switch — an axis this
 * predicate doesn't consider, because it is unreachable from
 * `BaseResolutionAdapter.onConfirm` (the track is chosen downstream of
 * choose_base). Keep the two predicates' id/mode handling in sync if that
 * ever changes, so they don't silently diverge.
 */
export function needsRebaseConfirm(newBaseId: string): boolean {
  const s = useWorkingCopyStore.getState();
  if (s.baseKeyboard?.id === newBaseId) return false;
  return hasUnsavedEdits();
}

/**
 * Synchronous confirm gate for a caller with its own explicit "confirm" click
 * (SurveyView's "Choose this keyboard" button). Returns true immediately
 * (no dialog) when no confirm is needed per {@link needsRebaseConfirm};
 * otherwise shows the native confirm and returns the user's choice.
 */
export function confirmRebaseTo(newBaseId: string): boolean {
  if (!needsRebaseConfirm(newBaseId)) return true;
  return window.confirm(REBASE_CONFIRM_MESSAGE);
}

/**
 * Shared onInstantiate body for PreviewShell and SurveyView.
 *
 * Guards that `ir` and `vfs` are non-null (mock-engine path), runs
 * {@link confirmRebaseIfEdited} (reads live store state to avoid stale-closure
 * issues) unless `options.skipConfirm` is set, then calls `instantiateFromBase`
 * from the store.
 *
 * `options.skipConfirm` — set by SurveyView's doCommit (via the reducer's
 * choose_base case) when the caller has ALREADY resolved the rebase question
 * synchronously via {@link confirmRebaseTo} in BaseResolutionAdapter.onConfirm
 * (F1 fix). Without this, doCommit's downstream call here would show the SAME
 * confirm dialog a second time for the one user click. Callers with no such
 * upstream synchronous check (usePreviewArtifact's decoupled onInstantiate)
 * omit the option and get the original confirmRebaseIfEdited behavior.
 *
 * Returns true when instantiation proceeded, false when it was skipped (mock
 * engine path or user cancelled the rebase confirm).
 */
export function instantiateFromBaseIfConfirmed(
  base: BaseKeyboard,
  { vfs, ir, removalCapabilities }: { vfs: VirtualFS | null; ir: KeyboardIR | null; removalCapabilities?: Map<string, RemovalCapability> },
  options?: { skipConfirm?: boolean },
): boolean {
  if (ir === null || vfs === null) {
    console.warn("[studio] instantiate skipped: no parsed IR (mock engine?)");
    return false;
  }
  if (!options?.skipConfirm && !confirmRebaseIfEdited()) return false;
  useWorkingCopyStore.getState().instantiateFromBase(base, {
    vfs,
    ir,
    ...(removalCapabilities !== undefined ? { removalCapabilities } : {}),
  });
  return true;
}
