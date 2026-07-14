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
import {
  saveServerDraft,
  saveServerDraftBeacon,
  type ServerDraftMeta,
} from "./serverDraftStore.ts";

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

/**
 * Debounce window for the signed-in cloud-sync writes (ms). Much coarser than
 * the 1 s localStorage autosave: localStorage is the instant local-first cache
 * (free, synchronous), while the server push is a durable backup that only
 * needs to be eventually-consistent, so we batch aggressively to keep request
 * volume (and cost) low. Checkpoints (tab hidden, page unload) flush sooner.
 */
const CLOUD_SYNC_DEBOUNCE_MS = 20_000;

/**
 * Client-side ceiling on a cloud-synced draft (bytes), mirroring the server's
 * MAX_DRAFT_BYTES. A draft above this is kept in localStorage but NOT pushed —
 * the server would 413 it anyway. We log rather than silently drop so an
 * oversized draft is diagnosable instead of appearing to sync.
 */
const MAX_CLOUD_DRAFT_BYTES = 4 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// StudioDraft / DraftMeta live in draftTypes.ts (a shared leaf) so serverDraftStore
// can reference them without a dependency cycle back into this module. Re-exported
// here so existing importers (StudioShell, ResumeDraftBanner) are unaffected.
export type { StudioDraft, DraftMeta } from "./draftTypes.ts";
import type { StudioDraft, DraftMeta } from "./draftTypes.ts";

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
  if (id != null && id.english.trim() !== "") return id.english;
  if (id != null && id.autonym.trim() !== "") return id.autonym;
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
 * Capture the current survey + working copy as a StudioDraft, or null when
 * there's no meaningful progress to persist. Shared by the localStorage
 * autosave and the signed-in cloud sync so both serialize identically.
 */
export function buildStudioDraft(): StudioDraft | null {
  const survey = surveySnapshot();
  const workingCopy = captureWorkingCopySnapshot();

  if (!hasMeaningfulProgress(survey, workingCopy)) return null;

  return {
    version: DRAFT_VERSION,
    savedAt: Date.now(),
    survey,
    workingCopy,
  };
}

/** Derive the server metadata row (resume-banner fields) from a draft. */
export function buildServerMeta(draft: StudioDraft): ServerDraftMeta {
  return {
    savedAt: draft.savedAt,
    activeStepId: draft.survey.activeStepId,
    label: deriveLabel(draft),
    // keyboardId is reserved for the future multi-project "My keyboards" key;
    // the single-draft model doesn't need it, so it stays null for now.
    keyboardId: null,
    schemaVersion: draft.version,
  };
}

/**
 * Capture the current survey + working copy and write it to localStorage.
 * No-op when there's no meaningful progress or storage is unavailable. Quota /
 * private-mode failures are swallowed so authoring never breaks on a failed save.
 */
export function saveDraft(): void {
  if (!storageAvailable()) return;

  const draft = buildStudioDraft();
  if (draft === null) return;

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
 * Restore both stores from the stored draft. Returns true only when the resume
 * fully applied: the working copy (when the draft has one) was applied
 * successfully, or there was no working copy to apply, AND the survey session
 * was hydrated. When a present working copy fails to apply (a corrupt
 * snapshot), the survey store is NOT hydrated — hydrating it anyway would leave
 * the wizard on the draft's activeStepId with no working copy behind it, a
 * silent partial resume — and this returns false so the caller treats the
 * resume as not instantiated. The working copy is applied first so the
 * survey's restored activeStepId lands on a step whose working copy already
 * exists. Does not clear the draft — the caller keeps it until submit/start-over.
 */
export function applyDraft(): boolean {
  const draft = readDraft();
  if (draft === null) return false;
  return applyStudioDraft(draft);
}

/**
 * Restore both stores from an explicit StudioDraft object (rather than reading
 * localStorage). Used by the cloud-restore path, where the draft arrives from
 * the server. Validates the record shape/version before applying — a stale or
 * malformed cloud draft is rejected (returns false) rather than hydrating the
 * stores at the wrong shape. The working copy is applied first so the survey's
 * restored activeStepId lands on a step whose working copy already exists.
 */
export function applyStudioDraft(draft: StudioDraft | null): boolean {
  if (
    draft == null ||
    typeof draft !== "object" ||
    draft.version !== DRAFT_VERSION ||
    draft.survey == null
  ) {
    return false;
  }

  if (draft.workingCopy !== null) {
    const applied = applyWorkingCopySnapshot(draft.workingCopy);
    if (!applied) return false;
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

/**
 * Start mirroring the in-progress draft to the server for a signed-in user.
 * Runs ALONGSIDE startDraftAutosave (localStorage stays the instant local
 * cache); this adds the durable server backup.
 *
 * `getToken` returns the current GitHub access token or null — read lazily on
 * each flush so signing in mid-session begins syncing without restarting the
 * subscription, and signing out stops it. Guests (token null) never push.
 *
 * Sync fires on a coarse debounce (CLOUD_SYNC_DEBOUNCE_MS) and on two
 * checkpoints — the tab becoming hidden and page unload (keepalive fetch) — so
 * a close or navigation doesn't lose up to a full debounce window. A content
 * hash suppresses redundant pushes when nothing changed since the last one, and
 * an oversized draft is kept local-only (logged, not silently dropped).
 *
 * Returns an unsubscribe that removes the listeners and cancels any pending timer.
 */
export function startCloudSync(getToken: () => string | null): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastPushedHash: string | null = null;
  let disposed = false;

  const flush = (viaBeacon: boolean): void => {
    const token = getToken();
    if (token === null || token === "") return;

    const draft = buildStudioDraft();
    if (draft === null) return;

    const body = JSON.stringify(draft);
    if (new TextEncoder().encode(body).length > MAX_CLOUD_DRAFT_BYTES) {
      // Kept in localStorage by the sibling autosave; skip the server push.
      console.warn("[cloudSync] draft exceeds server size limit; keeping local copy only");
      return;
    }

    const hash = simpleHash(body);
    if (hash === lastPushedHash) return; // nothing changed since the last push

    const meta = buildServerMeta(draft);
    if (viaBeacon) {
      // Unload path: fire-and-forget; assume it lands so we don't re-push.
      saveServerDraftBeacon(token, meta, draft);
      lastPushedHash = hash;
    } else {
      void saveServerDraft(token, meta, draft).then((ok) => {
        if (ok) lastPushedHash = hash;
      });
    }
  };

  const schedule = (): void => {
    if (disposed) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush(false);
    }, CLOUD_SYNC_DEBOUNCE_MS);
  };

  const onVisibilityChange = (): void => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      flush(false);
    }
  };
  const onBeforeUnload = (): void => flush(true);

  const unsubSurvey = useSurveySessionStore.subscribe(schedule);
  const unsubWorkingCopy = useWorkingCopyStore.subscribe(schedule);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", onBeforeUnload);
  }

  return () => {
    disposed = true;
    if (timer !== null) clearTimeout(timer);
    unsubSurvey();
    unsubWorkingCopy();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", onBeforeUnload);
    }
  };
}

// ---------------------------------------------------------------------------
// Internal — pull the serializable survey slots out of the store.
// ---------------------------------------------------------------------------

/**
 * Small, fast, non-cryptographic string hash (djb2). Used only to detect
 * "did the serialized draft change since the last successful push?" so we skip
 * redundant cloud writes — never for integrity or security.
 */
function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  // >>> 0 → unsigned; base36 keeps it short.
  return (h >>> 0).toString(36);
}

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
