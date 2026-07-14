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
