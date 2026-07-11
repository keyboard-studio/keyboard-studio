// draftAutosave — persist the in-progress survey + working copy to localStorage
// so an author can reload the page (or recover from a crash) and resume where
// they left off.
//
// Relationship to persistWorkingCopy.ts:
//   - persistWorkingCopy owns the *serialization* of the working copy (VFS
//     base64, Set→array, derived-field recompute) and the OAuth-redirect
//     sessionStorage path. This module reuses its capture/apply helpers.
//   - This module adds the survey-session slots (which the OAuth path does not
//     carry) and writes the combined draft to *localStorage* with a savedAt
//     timestamp, so it survives a tab close, not just a same-tab redirect.
//
// Lifecycle:
//   - startDraftAutosave() subscribes to both stores and writes a debounced
//     snapshot on every change once the survey has meaningful progress.
//   - loadDraftMeta() peeks at a stored draft (for the resume banner) WITHOUT
//     applying it — expired/malformed drafts are cleared and reported as absent.
//   - applyDraft() restores both stores from the stored draft.
//   - clearDraft() removes it (called on successful submit and start-over).
//
// Storage semantics differ from the OAuth path on purpose: the OAuth snapshot
// is consume-and-clear (a transient redirect scratch); this draft persists and
// is only applied on explicit user Resume, so a stale draft never silently
// clobbers a fresh session.

import type { SurveySessionSnapshot } from "../stores/surveySessionStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import {
  captureWorkingCopySnapshot,
  applyWorkingCopySnapshot,
  type WorkingCopySnapshot,
} from "./persistWorkingCopy.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for the resumable survey draft. */
const DRAFT_KEY = "ks.studio.draft";

/**
 * Draft schema version. Bump when the stored shape changes incompatibly; an
 * older-version draft is discarded on load rather than applied at the wrong shape.
 */
const DRAFT_VERSION = 1;

/** Drafts older than this are treated as expired and discarded on load (7 days). */
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Debounce window for autosave writes (ms). Coarser than the 300 ms validator
 * cycle so a burst of edits collapses into one localStorage write.
 *
 * This is a persistence-only debounce and does NOT violate decision D3's
 * "one debounce cycle" rule: D3 scopes the validation/preview trigger (TS-check
 * + WASM oracle) to avoid visible feedback races. This timer touches no
 * validation path and produces no preview feedback. See docs/architecture.md
 * ("Scope of D3").
 */
const AUTOSAVE_DEBOUNCE_MS = 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The persisted draft record. */
interface StudioDraft {
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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True when localStorage is usable (guards SSR / private-mode / disabled). */
function storageAvailable(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

/**
 * Whether the current survey state is worth persisting. A pristine survey (still
 * on the identity step with nothing entered and no working copy) writes nothing,
 * so an untouched reload doesn't leave a resumable-but-empty draft behind.
 */
function hasMeaningfulProgress(
  survey: SurveySessionSnapshot,
  workingCopy: WorkingCopySnapshot | null,
): boolean {
  return (
    workingCopy !== null ||
    survey.identityResult !== null ||
    survey.history.length > 0 ||
    survey.activeStepId !== "identity"
  );
}

/** Derive a human label for the draft from whatever identity/base info exists. */
function deriveLabel(draft: StudioDraft): string | null {
  const id = draft.survey.identityResult;
  if (id !== null && id.english.trim() !== "") return id.english;
  if (id !== null && id.autonym.trim() !== "") return id.autonym;
  if (draft.survey.scaffoldSpec !== null) return draft.survey.scaffoldSpec.displayName;
  if (draft.workingCopy?.baseKeyboard != null) return draft.workingCopy.baseKeyboard.displayName;
  return null;
}

/** Read and parse the stored draft, or null if absent/malformed/wrong-version. */
function readDraft(): StudioDraft | null {
  if (!storageAvailable()) return null;

  let raw: string | null;
  try {
    raw = localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  let draft: StudioDraft;
  try {
    draft = JSON.parse(raw) as StudioDraft;
  } catch {
    // Malformed JSON — drop it so it can't loop.
    clearDraft();
    return null;
  }

  if (
    draft == null ||
    typeof draft !== "object" ||
    draft.version !== DRAFT_VERSION ||
    typeof draft.savedAt !== "number" ||
    draft.survey == null
  ) {
    clearDraft();
    return null;
  }

  return draft;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Capture the current survey + working copy and write it to localStorage.
 * No-op when there's no meaningful progress or storage is unavailable. Quota /
 * private-mode failures are swallowed so authoring never breaks on a failed save.
 */
export function saveDraft(): void {
  if (!storageAvailable()) return;

  const survey = surveySnapshot();
  const workingCopy = captureWorkingCopySnapshot();

  if (!hasMeaningfulProgress(survey, workingCopy)) return;

  const draft: StudioDraft = {
    version: DRAFT_VERSION,
    savedAt: Date.now(),
    survey,
    workingCopy,
  };

  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Quota exceeded or private-browsing restriction — skip, don't crash.
  }
}

/**
 * Peek at a stored draft for the resume banner WITHOUT applying it. Expired
 * (> TTL) or malformed drafts are cleared and reported as absent, so the banner
 * only ever offers a live draft.
 */
export function loadDraftMeta(): DraftMeta | null {
  const draft = readDraft();
  if (draft === null) return null;

  if (Date.now() - draft.savedAt > DRAFT_TTL_MS) {
    clearDraft();
    return null;
  }

  return {
    savedAt: draft.savedAt,
    activeStepId: draft.survey.activeStepId,
    label: deriveLabel(draft),
  };
}

/**
 * Restore both stores from the stored draft. Returns true when a draft was
 * found and applied. The working copy is applied first so the survey's restored
 * activeStepId lands on a step whose working copy already exists. Does not clear
 * the draft — the caller keeps it until submit/start-over.
 */
export function applyDraft(): boolean {
  const draft = readDraft();
  if (draft === null) return false;

  if (draft.workingCopy !== null) {
    applyWorkingCopySnapshot(draft.workingCopy);
  }
  useSurveySessionStore.getState().hydrate(draft.survey);
  return true;
}

/** Remove the stored draft. Called on successful submit and on start-over. */
export function clearDraft(): void {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

/**
 * Subscribe to both stores and autosave (debounced) on every change. Returns an
 * unsubscribe function that also flushes any pending timer.
 *
 * Idempotent per call: each invocation wires its own subscriptions + timer.
 */
export function startDraftAutosave(): () => void {
  if (!storageAvailable()) return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      saveDraft();
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  const unsubSurvey = useSurveySessionStore.subscribe(schedule);
  const unsubWorkingCopy = useWorkingCopyStore.subscribe(schedule);

  return () => {
    if (timer !== null) clearTimeout(timer);
    unsubSurvey();
    unsubWorkingCopy();
  };
}

// ---------------------------------------------------------------------------
// Internal — pull the serializable survey slots out of the store.
// ---------------------------------------------------------------------------

function surveySnapshot(): SurveySessionSnapshot {
  const s = useSurveySessionStore.getState();
  return {
    activeStepId: s.activeStepId,
    history: [...s.history],
    identityResult: s.identityResult,
    identityPhaseResult: s.identityPhaseResult,
    surveyContext: s.surveyContext,
    selectedTrack: s.selectedTrack,
    scaffoldSpec: s.scaffoldSpec,
    localBase: s.localBase,
    charactersSubStage: s.charactersSubStage,
  };
}
