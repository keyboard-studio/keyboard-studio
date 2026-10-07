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
// `activeStepId` is typed against main's `ActiveStepId`
// (stores/surveySessionStore.ts) rather than a plain string.
//
// #1451: this module used to also carry `StudioDraft`, the ported dev
// reference implementation's OWN parallel draft envelope (draftAutosave.ts) —
// a second, near-identical shape (full SurveySessionSnapshot + a nullable
// workingCopy) that engine wrote to its own `ks.studio.*` localStorage
// keyspace and pushed to the server alongside `DurableDraft`. That whole
// engine — and `StudioDraft` with it — is retired: `DurableDraft` (below) is
// now the ONE draft envelope, for both the local record and the cloud sync.

import type { ActiveStepId, TraversalSnapshot } from "../stores/surveySessionStore.ts";
import type { WorkingCopySnapshot } from "./persistWorkingCopy.ts";
import type { DecisionRecordSnapshot } from "../decisions/decisionLogStore.ts";
import type { SurveyAnswerSnapshot } from "../stores/surveyAnswerStore.ts";
import type { DecisionSet } from "../decisions/decisionTypes.ts";

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
 * The Phase B build-list alphabet used to ride a `phaseBDraft` slice (P0
 * fix, post-data-model.md addition). Since spec 090 T021 the draft IS the
 * `character-inventory` / `invisibles-inventory` decision records, carried
 * by the `decisions` slice below; T025 removed the `phaseBDraft` field
 * from the written envelope. Records written between the P0 fix and T025
 * still carry the slice: `loadDraft` reads it tolerantly off the raw
 * record and migrates it into the decision values when the envelope's
 * decisions don't already carry the inventory (see draftPersistence.ts's
 * slice migration, spec 090 T025) — no DRAFT_VERSION bump, for the same
 * reason the field never had one: it was always optional/additive.
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
  /**
   * The append-only per-keyboard decision record (specs/053-decision-audit,
   * FR-005), so the trail survives a reload rather than starting empty every
   * boot.
   *
   * Optional and additive with NO `DRAFT_VERSION` bump, following the
   * `phaseBDraft` precedent directly above: a record written before this field
   * existed simply has no `decisionRecord`, and `loadDraft` reads that as "no
   * decisions recorded yet" rather than discarding an otherwise-good draft. A
   * version bump would do the opposite — it would throw away every existing
   * author's in-progress keyboard to add an audit log, which is the wrong trade
   * by a wide margin (research D-08, SC-009).
   */
  decisionRecord?: DecisionRecordSnapshot;
  /**
   * Every survey question's saved answer, each step's position and status
   * (spec 079 R-01, stores/surveyAnswerStore.ts). Optional and additive with no
   * `DRAFT_VERSION` bump, following the `phaseBDraft` / `decisionRecord`
   * precedent: a draft written before this field existed restores an empty
   * store, so every step shows its proposal and nothing is invented (FR-032).
   */
  surveyAnswers?: SurveyAnswerSnapshot;
  /**
   * Spec 088 FR-007: the decision store's snapshot — the ONLY saved record
   * of survey-question answers from draft version 2 on. Optional in the type
   * so the v1→v2 migration output and partial envelopes type-check; every
   * native v2 draft the writer produces carries it.
   */
  decisions?: DecisionSet;
  /**
   * Spec 088 US3 / contract C-4.3: v1 answers the migration could not map to
   * a decision (their question no longer exists). Carried on the migrated
   * envelope for the load path to surface to the author — never dropped, and
   * never persisted past the load (the v2 writer does not write this field).
   */
  migrationOrphans?: MigrationOrphan[];
}

/** One unmappable v1 answer, kept by the migration for surfacing (C-4.3). */
export interface MigrationOrphan {
  questionId: string;
  stepId: string;
  value: unknown;
}
