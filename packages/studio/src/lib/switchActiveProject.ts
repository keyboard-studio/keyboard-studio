// switchActiveProject — shared "resume a DIFFERENT already-instantiated
// project and navigate into it" primitive.
//
// Extracted (P2 synthesis) from two near-identical inline call sites —
// MyKeyboardsList.tsx's `handleResume` and CurrentKeyboardIndicator.tsx's
// `handleChange` — each of which restated the SAME "resumeProject() ->
// navigate only on success" sequence and its own copy of the "only navigate
// on success" comment. One helper gives FINDING 1 and the P0 fix below a
// single place to live rather than two.
//
// FINDING 4's original fix (#1451, now retired): `resumeProject()`
// (draftPersistence.ts) re-pins THAT module's own active-project pointer
// (`ks.draft.active`), but this codebase used to have a SECOND, deliberately
// un-unified active-project pointer — `ks.studio.activeProject`, owned by the
// since-retired draftAutosave.ts — which `resumeProject()` never touched.
// This function used to call that OTHER engine's `pinActiveProject()`
// alongside `resumeProject()` to keep both pointers in sync. Now that
// draftAutosave.ts is gone, there is only one active-project pointer, and
// `resumeProject()` already pins it on success — nothing further is needed
// here.
//
// P0 fix (silent autosave loss after an in-place switch): `navigateTo`
// below is a no-op when the caller is already on `#survey` — writing the
// hash to its current value fires no `hashchange`, so `StudioShell` never
// remounts `SurveyView`, and `installDraftAutosave`'s subscription (a React
// ref inside that component) never gets reinstalled for the newly-resumed
// project. `useProjectSwitchStore.bump()` is the explicit remount signal
// that closes that gap — see its own header for why THIS is the one call
// site it is wired to.
//
// Cross-reference (`scheduleSave`'s orphan guard, draftPersistence.ts ~1206):
// that guard closes the SAME hole from a different angle — it makes a stale
// subscription's write an inert no-op, for ANY path that orphans one, not
// just this one. The two are deliberately overlapping here, not simply
// redundant: the remount is a structural fix for the ONE path that reaches
// it (this function); the guard remains the backstop for every OTHER path
// that could repoint the active project without tearing down the component
// that owns the stale closure.
//
// Why a remount, rather than a fourth in-place way to make `SurveyView`'s
// bookkeeping match a new project (alongside `handleStartOver`'s in-place
// reset and `handleResumeDraft`/`promotePendingAutosave`'s in-place
// promotion): this switch's trigger — `CurrentKeyboardIndicator` — lives
// OUTSIDE `SurveyView` and can fire while `SurveyView` isn't even mounted,
// so it has no closure over the SurveyView-local refs those two mechanisms
// update in place. A remount is the only way to reach them from outside.
import { resumeProject } from "./draftPersistence.ts";
import { navigateTo } from "./navigate.ts";
import { useProjectSwitchStore } from "../stores/projectSwitchStore.ts";

/**
 * Resume `projectKey` (loading its draft into both stores and pinning it as
 * the active project) and navigate into the survey — but ONLY when the résumé
 * actually succeeded. A corrupt/wrong-shaped draft leaves the caller exactly
 * where it was rather than dropping the author into an empty wizard. Returns
 * the same success flag `resumeProject()` does, so a caller that wants to
 * react to failure still can.
 */
export function switchActiveProject(projectKey: string): boolean {
  const applied = resumeProject(projectKey);
  if (applied) {
    navigateTo("survey");
    // P0 fix: force a remount of `SurveyView` even when `navigateTo` above
    // was a no-op (already on `#survey`) — see this store's own header.
    useProjectSwitchStore.getState().bump();
  }
  return applied;
}
