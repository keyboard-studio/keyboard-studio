// draftTypes — shared "My keyboards" (multi-project draft index) types,
// PLUS the `DurableDraft` envelope type itself.
//
// Extracted to a dependency-free leaf module so draftPersistence.ts (the
// engine — the durable per-project draft + the ks.draftIndex.v1 index) and
// serverDraftStore.ts (the cloud transport) can both reference the SAME
// shapes without a dependency cycle: draftPersistence.ts has a real runtime
// dependency on serverDraftStore.ts (recordProjectSubmission/deleteProject/
// startCloudSync call its fetch functions), so serverDraftStore.ts must not
// import ANYTHING — value or type — back into draftPersistence.ts. `depcruise`
// flags type-only cycles too (an `import type` back-edge is still a cycle to
// its static-analysis pass), so `DurableDraft` itself lives here rather than
// in draftPersistence.ts with only a type-only re-export edge back to it.
// draftPersistence.ts re-exports `DurableDraft` from here so its existing
// external consumers (draftPersistence.test.ts, etc.) are unaffected.
//
// Ported from dev's reference implementation (draftAutosave.ts /
// draftTypes.ts, specs/047-my-keyboards) onto main's existing single-project
// draft engine (draftPersistence.ts). Adapted:
//   - `activeStepId` is typed against main's `ActiveStepId`
//     (stores/surveySessionStore.ts) rather than dev's ad hoc
//     SurveySessionSnapshot["activeStepId"] string.
//   - dev's separate `StudioDraft` type is NOT ported here — main's draft
//     envelope already exists as `DurableDraft` (below) and is reused
//     directly rather than re-invented under a second name.

import type { ActiveStepId, TraversalSnapshot } from "../stores/surveySessionStore.ts";
import type { WorkingCopySnapshot } from "./persistWorkingCopy.ts";
import type { PhaseBDraftSnapshot } from "../stores/phaseBDraftStore.ts";

/** Lightweight peek at a stored draft, for a future resume-affordance. */
export interface DraftMeta {
  savedAt: number;
  /** Current step the draft was on (e.g. "carve"). */
  activeStepId: ActiveStepId;
  /** Best-effort human label for the in-progress keyboard, or null. */
  label: string | null;
  /**
   * Where this draft came from. "local" (default) is the localStorage draft;
   * "cloud" is a server-backed draft offered for restore (e.g. a new tab /
   * different device after sign-in). Drives banner copy in a future caller.
   */
  source?: "local" | "cloud";
}

/**
 * Lightweight per-project row for the "My keyboards" list — no working-copy
 * payload, so the list can render fast without deserializing every project's
 * full `DurableDraft`. One entry per `ks.draft.<projectKey>.v1` record,
 * indexed under `ks.draftIndex.v1` (draftPersistence.ts).
 *
 * Kept structurally close to the server's `ServerDraftMeta`
 * (serverDraftStore.ts) on purpose — the two are the client/server mirrors of
 * the same project row. `projectKey` and `langTag` are the two client-only
 * additions (the server calls `projectKey` `draftId`; `langTag` is a
 * display-only convenience the server doesn't need).
 */
export interface ProjectIndexEntry {
  /** Stable per-project key — see deriveProjectKeyFromWorkingCopy() in draftPersistence.ts. */
  projectKey: string;
  /** Epoch ms the project was last saved. */
  savedAt: number;
  /** Current step the project was on (e.g. "carve"). */
  activeStepId: ActiveStepId;
  /** Best-effort human label for the project, or null. */
  label: string | null;
  /** BCP47 language tag for the card badge, or null. */
  langTag: string | null;
  /** Draft lifecycle. "submitted" projects are read-only (no Resume). */
  status: "draft" | "submitted";
  /** PR URL, set only when status === "submitted". */
  prUrl: string | null;
}

// ---------------------------------------------------------------------------
// DurableDraft envelope (data-model.md) — moved here from draftPersistence.ts
// (unchanged in shape/semantics) so serverDraftStore.ts can reference it
// without a value/type cycle back into draftPersistence.ts. See the module
// header above.
// ---------------------------------------------------------------------------

/**
 * The persisted record that lets an author resume across a reload.
 *
 * `workingCopy` and `traversal` are the two sub-entities defined in
 * data-model.md, reused verbatim from persistWorkingCopy.ts (working copy) and
 * surveySessionStore.ts (traversal) — see T017/T018.
 *
 * `phaseBDraft` (P0 fix, post-data-model.md addition) folds in the Phase B
 * build-list screen's in-progress typed/toggled alphabet
 * (../stores/phaseBDraftStore.ts) — NOT part of the original data-model.md
 * envelope because that store didn't exist yet. Without it, a reload/OAuth
 * return mid-build-list restored `traversal.discoveryMethod` /
 * `traversal.charactersSubStage` (already covered by TraversalSnapshot) but
 * landed the author back on the build-list screen with an EMPTY alphabet,
 * silently discarding everything they'd added — this studio-internal
 * persistence type is not the locked Pattern/Criterion contract, so extending
 * it is fine. Optional (`?`) rather than a DRAFT_VERSION bump: a
 * pre-this-change record simply has no `phaseBDraft` field, and `loadDraft`
 * treats that as "no draft alphabet yet" (`chars: []`) rather than discarding
 * an otherwise-good record — see the `envelope.phaseBDraft ??` fallback in
 * draftPersistence.ts's `loadDraft`.
 */
export interface DurableDraft {
  version: number;
  /** Advisory write-time epoch ms (e.g. "resumed a draft from N minutes ago"); not used for correctness. */
  savedAt: number;
  /** The per-project namespace this record is stored under (FR-014). */
  projectKey: string;
  /** Denormalized so a future project list can render without deserializing `workingCopy`. */
  displayName: string | null;
  /** Denormalized BCP47 language+script tag; same rationale as `displayName`. */
  languageTag: string | null;
  workingCopy: WorkingCopySnapshot;
  traversal: TraversalSnapshot;
  /** The Phase B build-list draft alphabet — see the doc comment above. */
  phaseBDraft?: PhaseBDraftSnapshot;
}
