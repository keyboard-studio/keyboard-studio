// Shared draft types, extracted so the localStorage engine (draftAutosave.ts)
// and the cloud transport (serverDraftStore.ts) can both reference them without
// importing each other — draftAutosave depends on serverDraftStore (it calls
// the transport), so the reverse type dependency would be a cycle. This module
// is the shared leaf both point at instead.

import type { SurveySessionSnapshot } from "../stores/surveySessionStore.ts";
import type { WorkingCopySnapshot } from "./persistWorkingCopy.ts";

/**
 * The persisted draft record. Written to localStorage for everyone and,
 * additionally, mirrored to the server for signed-in users — the same record
 * flows through both transports (the server treats it opaquely).
 */
export interface StudioDraft {
  version: number;
  /** Epoch ms when the draft was written (Date.now()). */
  savedAt: number;
  survey: SurveySessionSnapshot;
  /** Working copy, or null when the survey hasn't instantiated one yet. */
  workingCopy: WorkingCopySnapshot | null;
}

/** Lightweight peek at a stored draft, for the resume banner. */
export interface DraftMeta {
  savedAt: number;
  /** Current step the draft was on (e.g. "carve"). */
  activeStepId: SurveySessionSnapshot["activeStepId"];
  /** Best-effort human label for the in-progress keyboard, or null. */
  label: string | null;
  /**
   * Where this draft came from. "local" (default) is the localStorage draft;
   * "cloud" is a server-backed draft offered for restore (e.g. a new tab /
   * different device after sign-in). Drives the banner copy.
   */
  source?: "local" | "cloud";
}

/**
 * Lightweight per-project row for the "My keyboards" list — no working-copy
 * payload, so the list can render fast without deserializing every project's
 * full `StudioDraft`. One entry per `ks.studio.project.<projectKey>` record.
 *
 * Kept structurally close to the server's `DraftMeta` (draft-schemas.ts) on
 * purpose — the two are the client/server mirrors of the same project row, so
 * `buildServerMeta()`/`buildIndexEntry()` can map one from the other with a
 * single function each, not two divergent shapes. `projectKey` and `langTag`
 * are the two client-only additions (the server calls `projectKey` `draftId`;
 * `langTag` is a display-only convenience the server doesn't need).
 */
export interface ProjectIndexEntry {
  /** Stable per-project key — see deriveProjectKey() in draftAutosave.ts. */
  projectKey: string;
  /** Epoch ms the project was last saved. */
  savedAt: number;
  /** Current step the project was on (e.g. "carve"). */
  activeStepId: SurveySessionSnapshot["activeStepId"];
  /** Best-effort human label for the project, or null. */
  label: string | null;
  /** BCP47 language tag for the card badge, or null. */
  langTag: string | null;
  /** Draft lifecycle. "submitted" projects are read-only (no Resume). */
  status: "draft" | "submitted";
  /** PR URL, set only when status === "submitted". */
  prUrl: string | null;
}
