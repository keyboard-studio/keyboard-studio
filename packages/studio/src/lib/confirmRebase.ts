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
//   base switch would re-derive under the new base (spec 093 T017: retained
//   and recalculated, not discarded — the predicate gates the CONSENT, whose
//   wording is REBASE_CONFIRM_MESSAGE below). Shared by confirmRebaseIfEdited
//   (below) and needsRebaseConfirm (the SAME-base-aware variant used by
//   SurveyView's synchronous confirm-click guard — see
//   BaseResolutionAdapter.onConfirm in editors/adapters/panelAdapters.tsx).
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
//   Shared body for onInstantiate callbacks in OutputScreen and SurveyView.
//   NOT reachable from the Compare tab, which passes no onInstantiate at all
//   (spec 057 FR-022).
//   Guards on ir/vfs availability, calls confirmRebaseIfEdited (unless the
//   caller passes `skipConfirm: true` — see the `options` param doc below),
//   then dispatches instantiateFromBase.

import { devLog } from "@keyboard-studio/contracts/dev-log";
import type { BaseKeyboard, RemovalCapability, VirtualFS, KeyboardIR } from "@keyboard-studio/contracts";
import { useWorkingCopyStore, type IdentityPatch } from "../stores/workingCopyStore.ts";
import { getDecisionSnapshot } from "../stores/decisionStore.ts";
import { deriveIdentityResult } from "../decisions/identitySelectors.ts";
import { identityLanguagePatch } from "./identityLanguagePatch.ts";

/**
 * User-facing wording for the rebase confirm dialog — the single source of truth for the string.
 *
 * Spec 093 T017 (owner ruling (b), 2026-10-07): a base switch is RETAIN +
 * RECALCULATE — the author's decisions are kept and re-derived against the
 * new base, and answers that no longer fit are re-proposed, never silently
 * dropped. The consent copy promises exactly that (it replaced the F1
 * discard-by-consent wording in the same change that wired the
 * recalculation into StudioShell's doCommit). The confirm still gates the
 * switch because the working copy IS rebuilt: extracted values change to
 * the new base's, and some answers will need a fresh decision.
 */
export const REBASE_CONFIRM_MESSAGE =
  "Switching base keyboards keeps your answers and re-checks them against the new base. Answers that no longer fit will be offered again for your decision — nothing is discarded silently. Continue?";

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
 * switch the base under an edited working copy (and so need the rebase
 * consent)? Always false when `newBaseId` matches the currently
 * instantiated base — a same-base re-confirm is never a switch (see the
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
 * Shared onInstantiate body for OutputScreen and SurveyView.
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
/**
 * The identity a new Track 1 working copy starts with: the language the
 * identity step composed, and the base's own display name.
 *
 * Without it the copy starts with `identity: null`, and on the adapt track it
 * stays that way — project_name is the only other writer before output, and
 * adapt skips it. Every `identity.bcp47` reader then works without the
 * author's language: the carve needed set never consults the language's
 * exemplars, and the package descriptor falls back to `und`.
 *
 * The display name is the base's own, which both projection paths already
 * treat as "not an edit" (the `.kmn` name store stays byte-identical) and
 * which the descriptor would otherwise fall back to anyway. No keyboard id is
 * seeded: choosing one is the author's act, and every id reader checks for
 * its absence. The copy track's project_name commit replaces the whole seed.
 *
 * Returns undefined when the identity step recorded no language tag, so the
 * copy starts with no overlay exactly as before.
 */
export function identitySeedFromSession(base: BaseKeyboard): IdentityPatch | undefined {
  const result = deriveIdentityResult(getDecisionSnapshot());
  const bcp47 = result?.bcp47.trim() ?? "";
  if (bcp47 === "") return undefined;
  // Language overlay via the shared composition rule (identityLanguagePatch)
  // — never re-derived here.
  return {
    displayName: base.displayName,
    ...identityLanguagePatch(result),
  };
}

export function instantiateFromBaseIfConfirmed(
  base: BaseKeyboard,
  { vfs, ir, removalCapabilities }: { vfs: VirtualFS | null; ir: KeyboardIR | null; removalCapabilities?: Map<string, RemovalCapability> },
  options?: { skipConfirm?: boolean },
): boolean {
  if (ir === null || vfs === null) {
    devLog.warn("[studio] instantiate skipped: no parsed IR (mock engine?)");
    return false;
  }
  if (!options?.skipConfirm && !confirmRebaseIfEdited()) return false;
  const identitySeed = identitySeedFromSession(base);
  useWorkingCopyStore.getState().instantiateFromBase(base, {
    vfs,
    ir,
    ...(removalCapabilities !== undefined ? { removalCapabilities } : {}),
    ...(identitySeed !== undefined ? { identitySeed } : {}),
  });
  return true;
}

/**
 * Track 2 (adapt) instantiation with the author's identity seed applied —
 * the adapt counterpart of {@link instantiateFromBaseIfConfirmed}'s seeding.
 *
 * The setup-decision gate (spec 092) made instantiation wait until the
 * authoring-track decision is recorded, so an adapt walk now ALWAYS lands
 * here with the author's identity answers already in the decision store —
 * but the raw `instantiateFromExisting` action composes its identity from
 * the BASE alone (its first language tag, no language name), and no later
 * step repairs it: `project_keyboard_id`'s apply is the identity channel's
 * only decision writer and it is copy-track only, and the derived-keyboard
 * rebuild preserves the instantiation-seeded identity. The emitted package
 * descriptor therefore declared the base's raw tag as the `<Language>`
 * display text (`<Language ID="fr">fr</Language>`) instead of the author's
 * language name. Composing the same seed the copy track gets — via the one
 * composition rule, {@link identitySeedFromSession} — at the one moment the
 * identity is first written fixes every downstream reader at once.
 */
export function instantiateFromExistingWithIdentitySeed(
  base: BaseKeyboard,
  opts: { vfs: VirtualFS; ir: KeyboardIR; removalCapabilities?: Map<string, RemovalCapability> },
): void {
  const identitySeed = identitySeedFromSession(base);
  useWorkingCopyStore.getState().instantiateFromExisting(base, {
    ...opts,
    ...(identitySeed !== undefined ? { identitySeed } : {}),
  });
}
