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
// Multi-project ("My keyboards") storage scheme (specs/037-my-keyboards/spec.md
// "Client data model"), replacing the single `ks.studio.draft` key:
//   - `ks.studio.projects.index`   — ProjectIndexEntry[]; lightweight list for
//                                    "My keyboards", no working-copy payload.
//   - `ks.studio.project.<key>`    — StudioDraft (unchanged shape), one per
//                                    project.
//   - `ks.studio.activeProject`    — which projectKey the current survey
//                                    session belongs to; read on StudioShell
//                                    mount.
// `projectKey = identity.keyboardId ?? baseKeyboard.id`; before a working copy
// is instantiated (survey-only progress), the reserved `"__pending__"` slot is
// used — promoted to a real key (see resolveActiveProjectKey below) the moment
// a working copy exists and the draft is next saved. Per the spec's Non-goals,
// an ALREADY-real key never re-keys later (e.g. a Track 1 keyboardId rename
// mid-session does not move the project) — only the pending→real promotion is
// automatic.
//
// Lifecycle:
//   - migrateLegacyDraft() adopts a pre-existing single `ks.studio.draft` into
//     the scheme above. One-shot, idempotent (see its docstring).
//   - startDraftAutosave() subscribes to both stores and writes a debounced
//     snapshot (to the ACTIVE project) on every change once the survey has
//     meaningful progress.
//   - loadDraftMeta() peeks at the ACTIVE project's stored draft (for the
//     resume banner) WITHOUT applying it — expired/malformed drafts are
//     cleared and reported as absent.
//   - applyDraft() restores both stores from the ACTIVE project's stored draft.
//   - listDrafts() / resumeProject() / deleteProject() are the "My keyboards"
//     entry points the (not-yet-built, next-cycle) ProfileScreen will import.
//   - clearDraft() removes the ACTIVE project's record entirely (called on
//     start-over and on draft-discard — an explicit "throw it away").
//   - recordProjectSubmission() transitions the active project to
//     status:"submitted" (called on successful managed-PR submit, REPLACING
//     the old clearDraft() call there — a submitted project stays in the list).
//     A submitted project is then FROZEN: both write paths (saveDraft's
//     debounced localStorage write and startCloudSync's flush) route the
//     resolved projectKey through resolveActiveProjectKeyForWrite(), which
//     vetoes the write (and any active-pointer pin/promotion) whenever the
//     target project's stored status is already "submitted" — see that
//     function's docstring. This is what stops an author who keeps editing in
//     the same tab after submit from silently re-pinning the active pointer
//     back onto the submitted project and drifting its stored snapshot past
//     what was actually submitted.
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
  clearServerDraft,
  type ServerDraftMeta,
} from "./serverDraftStore.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Legacy single-slot localStorage key, pre-"My keyboards". Migration-only. */
const LEGACY_DRAFT_KEY = "ks.studio.draft";

/** localStorage key for the "My keyboards" project index (list render). */
const PROJECT_INDEX_KEY = "ks.studio.projects.index";

/** localStorage key prefix for one project's full StudioDraft record. */
const PROJECT_KEY_PREFIX = "ks.studio.project.";

/** localStorage key for the pointer to the current survey session's project. */
const ACTIVE_PROJECT_KEY = "ks.studio.activeProject";

/**
 * Reserved projectKey for a survey session with no instantiated working copy
 * yet (no keyboardId / baseKeyboard.id to derive a real key from). At most one
 * such draft can exist at a time — see the module docstring.
 */
export const PENDING_PROJECT_KEY = "__pending__";

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

// StudioDraft / DraftMeta / ProjectIndexEntry live in draftTypes.ts (a shared
// leaf) so serverDraftStore can reference them without a dependency cycle back
// into this module. Re-exported here so existing importers (StudioShell,
// ResumeDraftBanner) are unaffected.
export type { StudioDraft, DraftMeta, ProjectIndexEntry } from "./draftTypes.ts";
import type { StudioDraft, DraftMeta, ProjectIndexEntry } from "./draftTypes.ts";

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

/**
 * Derive a language-tag label for the "My keyboards" card badge:
 * identity.bcp47 (Track 1's chosen tag) wins, falling back to the base
 * keyboard's first supported language, or null when neither exists.
 */
function deriveLangTag(draft: StudioDraft): string | null {
  const wc = draft.workingCopy;
  if (wc === null) return null;
  return wc.identity?.bcp47 ?? wc.baseKeyboard?.languages?.[0] ?? null;
}

/**
 * Derive the stable per-project key from a working-copy snapshot: Track 1's
 * author-chosen `identity.keyboardId` wins (it's what the output layer renames
 * the VFS to); `baseKeyboard.id` is the Track 2 / pre-rename fallback. No
 * working copy yet (survey-only progress) uses the reserved pending slot.
 *
 * Pure function — exported for unit testing (specs/037-my-keyboards/spec.md
 * "Testing strategy": projectKey derivation as a pure-function unit test).
 */
export function deriveProjectKey(workingCopy: WorkingCopySnapshot | null): string {
  if (workingCopy === null) return PENDING_PROJECT_KEY;
  return workingCopy.identity?.keyboardId ?? workingCopy.baseKeyboard?.id ?? PENDING_PROJECT_KEY;
}

/** Build the ProjectIndexEntry mirror of a StudioDraft for a given project key. */
function buildIndexEntry(
  projectKey: string,
  draft: StudioDraft,
  overrides?: { status?: "draft" | "submitted"; prUrl?: string | null },
): ProjectIndexEntry {
  return {
    projectKey,
    savedAt: draft.savedAt,
    activeStepId: draft.survey.activeStepId,
    label: deriveLabel(draft),
    langTag: deriveLangTag(draft),
    status: overrides?.status ?? "draft",
    prUrl: overrides?.prUrl ?? null,
  };
}

// ---------------------------------------------------------------------------
// Per-project storage primitives
// ---------------------------------------------------------------------------

function projectStorageKey(projectKey: string): string {
  return `${PROJECT_KEY_PREFIX}${projectKey}`;
}

function readProjectIndex(): ProjectIndexEntry[] {
  if (!storageAvailable()) return [];
  try {
    const raw = localStorage.getItem(PROJECT_INDEX_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProjectIndexEntry[]) : [];
  } catch {
    return [];
  }
}

function writeProjectIndex(entries: ProjectIndexEntry[]): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded or private-browsing restriction — skip, don't crash.
  }
}

/** Insert or replace a project's index row (matched by projectKey). */
function upsertIndexEntry(entry: ProjectIndexEntry): void {
  const entries = readProjectIndex();
  const idx = entries.findIndex((e) => e.projectKey === entry.projectKey);
  if (idx === -1) entries.push(entry);
  else entries[idx] = entry;
  writeProjectIndex(entries);
}

function removeIndexEntry(projectKey: string): void {
  writeProjectIndex(readProjectIndex().filter((e) => e.projectKey !== projectKey));
}

/** Carry over an existing project's status/prUrl so autosave never downgrades a submitted project back to "draft". */
function existingStatusOverrides(
  projectKey: string,
): { status?: "draft" | "submitted"; prUrl?: string | null } | undefined {
  const existing = readProjectIndex().find((e) => e.projectKey === projectKey);
  return existing === undefined ? undefined : { status: existing.status, prUrl: existing.prUrl };
}

/**
 * Whether `projectKey`'s stored "My keyboards" index row is already
 * `status: "submitted"` — i.e. FROZEN against further autosave/cloud-sync
 * writes (spec's Non-goal: "no re-editing/re-import of submitted projects").
 * Used by resolveActiveProjectKeyForWrite() to veto a write before it can
 * overwrite the submitted snapshot or re-pin the active pointer onto it.
 */
function isProjectFrozen(projectKey: string): boolean {
  return readProjectIndex().some((e) => e.projectKey === projectKey && e.status === "submitted");
}

/**
 * Parse + shape-validate a raw localStorage string into a StudioDraft, or
 * null on any failure (malformed JSON, wrong version, missing required
 * fields). `onInvalid` is called exactly once when parsing/shape validation
 * fails, so each call site applies its own removal semantics
 * (readProjectDraft() removes the per-project record; readLegacyDraft()
 * clears the legacy single-slot key). `applyTtl`, when true, additionally
 * discards (and calls onInvalid for) a draft older than DRAFT_TTL_MS —
 * currently only readLegacyDraft() passes true; the per-project TTL check
 * lives in loadDraftMeta() instead (it applies only to the ACTIVE project's
 * peek, not every readProjectDraft() call), so readProjectDraft() passes
 * false and leaves that check where it already was.
 *
 * Shared by readProjectDraft() and readLegacyDraft(), which were previously
 * near-identical parse/shape-validate bodies differing only in the removal
 * callback and the inline TTL check.
 */
function parseStoredDraft(
  raw: string,
  onInvalid: () => void,
  applyTtl: boolean,
): StudioDraft | null {
  let draft: StudioDraft;
  try {
    draft = JSON.parse(raw) as StudioDraft;
  } catch {
    // Malformed JSON — drop it so it can't loop.
    onInvalid();
    return null;
  }

  if (
    draft == null ||
    typeof draft !== "object" ||
    draft.version !== DRAFT_VERSION ||
    typeof draft.savedAt !== "number" ||
    draft.survey == null
  ) {
    onInvalid();
    return null;
  }

  if (applyTtl && Date.now() - draft.savedAt > DRAFT_TTL_MS) {
    onInvalid();
    return null;
  }

  return draft;
}

/** Read and validate one project's stored draft, or null if absent/malformed/wrong-version. */
function readProjectDraft(projectKey: string): StudioDraft | null {
  if (!storageAvailable()) return null;

  let raw: string | null;
  try {
    raw = localStorage.getItem(projectStorageKey(projectKey));
  } catch {
    return null;
  }
  if (raw === null) return null;

  return parseStoredDraft(raw, () => removeProjectLocal(projectKey), false);
}

function writeProjectDraft(projectKey: string, draft: StudioDraft): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(projectStorageKey(projectKey), JSON.stringify(draft));
  } catch {
    // Quota exceeded or private-browsing restriction — skip, don't crash.
  }
}

/**
 * Remove one project entirely: its full-draft record + its index row, and
 * (when it was the active project) the active-project pointer. Shared by
 * clearDraft() (active-project-only), the TTL-expiry path, malformed-draft
 * recovery, and the public deleteProject().
 */
function removeProjectLocal(projectKey: string): void {
  if (storageAvailable()) {
    try {
      localStorage.removeItem(projectStorageKey(projectKey));
    } catch {
      // ignore
    }
  }
  removeIndexEntry(projectKey);
  if (getActiveProjectKey() === projectKey) {
    setActiveProject(null);
  }
}

// ---------------------------------------------------------------------------
// Active-project pointer
// ---------------------------------------------------------------------------

/** Which projectKey the current survey session belongs to, or null. */
export function getActiveProjectKey(): string | null {
  if (!storageAvailable()) return null;
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY);
  } catch {
    return null;
  }
}

/**
 * Set (or clear, with null) the active-project pointer. Called on
 * instantiation (StudioShell), on Resume, and read on StudioShell mount to
 * decide which per-project record to load.
 */
export function setActiveProject(projectKey: string | null): void {
  if (!storageAvailable()) return;
  try {
    if (projectKey === null) localStorage.removeItem(ACTIVE_PROJECT_KEY);
    else localStorage.setItem(ACTIVE_PROJECT_KEY, projectKey);
  } catch {
    // ignore
  }
}

/**
 * Pure computation of which project the CURRENT autosave/cloud-sync write
 * would resolve to, WITHOUT performing the pin (no storage mutation). Split
 * out of resolveActiveProjectKey so the frozen-project guard
 * (resolveActiveProjectKeyForWrite) can inspect the target key BEFORE
 * deciding whether the pin/write should happen at all.
 *
 * - No active project yet (fresh session) → target = derived from this draft.
 * - Active project is the pending slot AND a real key is now derivable (the
 *   working copy has just been instantiated) → target = the real key
 *   (promotion; spec: "promoted to a real key the moment a working copy is
 *   instantiated and the draft is next saved").
 * - Otherwise → target = the already-pinned key, even if the draft's own
 *   identity/base would derive a different one now (Non-goal: no re-keying
 *   of an in-flight project on a mid-session `keyboardId` rename).
 */
function computeTargetProjectKey(draft: StudioDraft): {
  stored: string | null;
  derived: string;
  target: string;
} {
  const stored = getActiveProjectKey();
  const derived = deriveProjectKey(draft.workingCopy);
  const promoting = stored === PENDING_PROJECT_KEY && derived !== PENDING_PROJECT_KEY;
  const target = stored === null ? derived : promoting ? derived : stored;
  return { stored, derived, target };
}

/**
 * Resolve which project the CURRENT autosave/cloud-sync write belongs to, and
 * persist that resolution as the active project. Pure pin/promotion logic —
 * see computeTargetProjectKey() for the resolution rules. Callers that must
 * not write into (or re-pin onto) a submitted project should go through
 * resolveActiveProjectKeyForWrite() instead, which wraps this with the
 * frozen-project veto.
 */
function resolveActiveProjectKey(draft: StudioDraft): string {
  const { stored, target } = computeTargetProjectKey(draft);

  if (stored === null) {
    setActiveProject(target);
    return target;
  }
  if (stored === PENDING_PROJECT_KEY && target !== PENDING_PROJECT_KEY) {
    removeProjectLocal(PENDING_PROJECT_KEY);
    setActiveProject(target);
    return target;
  }
  return target;
}

/**
 * FINDING 1 fix (post-submit reactivation). Frozen-project-aware wrapper
 * around resolveActiveProjectKey(), used by the two autosave write paths
 * (saveDraft, the cloud-sync flush). When the target project this write
 * would resolve to is already `status: "submitted"` (isProjectFrozen()),
 * returns null and performs NO storage mutation at all — no pin, no promotion
 * cleanup, nothing — so a submitted project's stored StudioDraft + index row
 * are never silently overwritten and the active-project pointer is never
 * silently re-pinned back onto it.
 *
 * This is the exact scenario the guard closes: after recordProjectSubmission()
 * clears the active pointer, an author who keeps editing in the SAME tab
 * causes the next debounced write to land in computeTargetProjectKey's
 * `stored === null` branch, re-deriving the SAME (now-submitted) projectKey
 * from the still-loaded working copy. Gating here — at every write call site —
 * is robust against the navigation-driven re-pin path (e.g. StudioShell's
 * `pinActiveProject()` on a fresh `onInstantiate`) precisely because it does
 * not depend on catching that re-pin at its source: no matter how the active
 * pointer ends up aimed at (or the working copy resolves to) a submitted
 * projectKey, every write still funnels through this same veto before it can
 * touch storage. A genuinely different (non-frozen) target key — e.g. a
 * fresh keyboard started after the submit — is untouched by this guard and
 * autosaves normally.
 */
function resolveActiveProjectKeyForWrite(draft: StudioDraft): string | null {
  const { target } = computeTargetProjectKey(draft);
  if (isProjectFrozen(target)) return null;
  return resolveActiveProjectKey(draft);
}

/**
 * Eagerly pin the active-project pointer to `projectKey` at working-copy
 * instantiation (StudioShell's onInstantiate), rather than waiting for the
 * next autosave debounce to resolve it. Applies the same pending→real
 * promotion rule as resolveActiveProjectKey (cleaning up the orphaned
 * `"__pending__"` slot when applicable) so the two call sites can never
 * disagree about the active project. Switching onto a different already-real
 * key (e.g. starting a new keyboard) only repoints the pointer — every other
 * project's stored record + index row is untouched.
 */
export function pinActiveProject(projectKey: string): void {
  const stored = getActiveProjectKey();
  if (stored === projectKey) return;
  if (stored === PENDING_PROJECT_KEY) {
    removeProjectLocal(PENDING_PROJECT_KEY);
  }
  setActiveProject(projectKey);
}

// ---------------------------------------------------------------------------
// Legacy single-slot read/clear — migration-only, not used post-migration.
// ---------------------------------------------------------------------------

function clearLegacyDraft(): void {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(LEGACY_DRAFT_KEY);
  } catch {
    // ignore
  }
}

/** Read + validate the legacy draft (version, shape, TTL), clearing it on any failure. */
function readLegacyDraft(): StudioDraft | null {
  if (!storageAvailable()) return null;

  let raw: string | null;
  try {
    raw = localStorage.getItem(LEGACY_DRAFT_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  return parseStoredDraft(raw, clearLegacyDraft, true);
}

/**
 * One-shot, idempotent adoption of the pre-"My keyboards" single `ks.studio.draft`
 * key into the per-project scheme (specs/037-my-keyboards/spec.md "Migration").
 *
 * Guard: a no-op the moment `ks.studio.projects.index` already exists — so it
 * can never clobber a newer per-project draft, and running it twice (e.g. two
 * StudioShell mounts in the same JS context) is safe. Call this once, before
 * autosave/cloud-sync start (see StudioShell.tsx module-init call site).
 */
export function migrateLegacyDraft(): void {
  if (!storageAvailable()) return;

  let alreadyMigrated: string | null;
  try {
    alreadyMigrated = localStorage.getItem(PROJECT_INDEX_KEY);
  } catch {
    return;
  }
  if (alreadyMigrated !== null) return;

  const legacy = readLegacyDraft();
  if (legacy === null) {
    writeProjectIndex([]);
    return;
  }

  const projectKey = deriveProjectKey(legacy.workingCopy);
  writeProjectDraft(projectKey, legacy);
  writeProjectIndex([buildIndexEntry(projectKey, legacy)]);
  setActiveProject(projectKey);
  clearLegacyDraft();
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

/**
 * Derive the server metadata row for one project. `projectKey` becomes the
 * server's `draftId` (and, when it's a real key rather than the pending slot,
 * also `keyboardId` — display-only on the server, may legitimately differ
 * from `draftId` in the general schema, but is always equal to it for a
 * project created under this feature).
 */
export function buildServerMeta(
  draft: StudioDraft,
  projectKey: string,
  overrides?: { status?: "draft" | "submitted"; prUrl?: string | null },
): ServerDraftMeta {
  return {
    savedAt: draft.savedAt,
    activeStepId: draft.survey.activeStepId,
    label: deriveLabel(draft),
    keyboardId: projectKey === PENDING_PROJECT_KEY ? null : projectKey,
    schemaVersion: draft.version,
    draftId: projectKey,
    status: overrides?.status ?? "draft",
    prUrl: overrides?.prUrl ?? null,
  };
}

/**
 * Capture the current survey + working copy and write it to the ACTIVE
 * project's localStorage record, upserting its "My keyboards" index row.
 * No-op when there's no meaningful progress or storage is unavailable. Quota /
 * private-mode failures are swallowed so authoring never breaks on a failed save.
 */
export function saveDraft(): void {
  if (!storageAvailable()) return;

  const draft = buildStudioDraft();
  if (draft === null) return;

  // FINDING 1 guard: a submitted project is frozen — skip the write AND do
  // not re-pin the active pointer onto it. See resolveActiveProjectKeyForWrite().
  const projectKey = resolveActiveProjectKeyForWrite(draft);
  if (projectKey === null) return;

  writeProjectDraft(projectKey, draft);
  upsertIndexEntry(buildIndexEntry(projectKey, draft, existingStatusOverrides(projectKey)));
}

/**
 * Peek at the ACTIVE project's stored draft for the resume banner WITHOUT
 * applying it. Expired (> TTL) or malformed drafts are cleared and reported as
 * absent, so the banner only ever offers a live draft. Returns null when there
 * is no active project.
 */
export function loadDraftMeta(): DraftMeta | null {
  const projectKey = getActiveProjectKey();
  if (projectKey === null) return null;

  const draft = readProjectDraft(projectKey);
  if (draft === null) return null;

  if (Date.now() - draft.savedAt > DRAFT_TTL_MS) {
    removeProjectLocal(projectKey);
    return null;
  }

  return {
    savedAt: draft.savedAt,
    activeStepId: draft.survey.activeStepId,
    label: deriveLabel(draft),
  };
}

/**
 * Restore both stores from the ACTIVE project's stored draft. Returns true
 * only when the resume fully applied: the working copy (when the draft has
 * one) was applied successfully, or there was no working copy to apply, AND
 * the survey session was hydrated. When a present working copy fails to apply
 * (a corrupt snapshot), the survey store is NOT hydrated — hydrating it anyway
 * would leave the wizard on the draft's activeStepId with no working copy
 * behind it, a silent partial resume — and this returns false so the caller
 * treats the resume as not instantiated. The working copy is applied first so
 * the survey's restored activeStepId lands on a step whose working copy
 * already exists. Does not clear the draft — the caller keeps it until
 * submit/start-over.
 */
export function applyDraft(): boolean {
  const projectKey = getActiveProjectKey();
  if (projectKey === null) return false;
  const draft = readProjectDraft(projectKey);
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

/**
 * Remove the ACTIVE project's record entirely (its full-draft key + its
 * "My keyboards" index row), and clear the active-project pointer. This is an
 * explicit "throw it away" — called on start-over and on draft-discard. A
 * successful submit does NOT call this; see recordProjectSubmission(), which
 * transitions the project to "submitted" and keeps its record instead.
 */
export function clearDraft(): void {
  const projectKey = getActiveProjectKey();
  if (projectKey === null) return;
  removeProjectLocal(projectKey);
}

// ---------------------------------------------------------------------------
// "My keyboards" — list / resume-by-project / delete-by-project.
//
// Public entry points the (next-cycle) ProfileScreen will import. Built now so
// this cycle exposes the client API without building the UI itself.
// ---------------------------------------------------------------------------

/** The local "My keyboards" project list, newest-saved first. */
export function listDrafts(): ProjectIndexEntry[] {
  return [...readProjectIndex()].sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Resume a SPECIFIC project (not necessarily the currently-active one): load
 * its StudioDraft, apply it to both stores, and — only on a successful apply —
 * set it as the active project. Mirrors applyDraft()'s false-on-partial-
 * failure contract (US2 acceptance scenario 2): a corrupt working-copy
 * snapshot fails the whole resume rather than silently landing the survey on
 * an empty wizard with the wrong project now active.
 */
export function resumeProject(projectKey: string): boolean {
  const draft = readProjectDraft(projectKey);
  if (draft === null) return false;
  const applied = applyStudioDraft(draft);
  if (applied) setActiveProject(projectKey);
  return applied;
}

/**
 * Delete a SPECIFIC project: its local record + index row (and the
 * active-project pointer, if it was pointing at this project), and — for a
 * signed-in caller — the server-side row via `DELETE /drafts?draftId=<key>`.
 * The server call is fire-and-soft-fail (clearServerDraft already swallows
 * every transport error): a guest or an offline signed-in caller still gets
 * the local removal.
 */
export async function deleteProject(projectKey: string, token: string | null): Promise<void> {
  removeProjectLocal(projectKey);
  if (token !== null && token !== "") {
    await clearServerDraft(token, projectKey);
  }
}

/**
 * Transition the ACTIVE project to status:"submitted" with the given PR URL —
 * called on a successful managed-PR submit INSTEAD of clearDraft() (the old
 * behavior, which deleted the record outright). The project's index row is
 * updated in place and, for a signed-in caller, PUT to the server with the
 * same status/prUrl; the existing draft payload is sent unchanged so the
 * project keeps its full working-copy record (spec: "not a deletion"). The
 * active-project pointer is cleared afterward — the survey session that just
 * submitted is over — but the project's own storage/index row is NOT removed,
 * so it keeps appearing in "My keyboards" as a Submitted card.
 */
export async function recordProjectSubmission(prUrl: string, token: string | null): Promise<void> {
  const projectKey = getActiveProjectKey();
  if (projectKey === null) return;

  const draft = readProjectDraft(projectKey);
  if (draft === null) {
    setActiveProject(null);
    return;
  }

  const overrides = { status: "submitted" as const, prUrl };
  upsertIndexEntry(buildIndexEntry(projectKey, draft, overrides));

  if (token !== null && token !== "") {
    const meta = buildServerMeta(draft, projectKey, overrides);
    void saveServerDraft(token, meta, draft, projectKey);
  }

  setActiveProject(null);
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
 * Project-aware: resolves (and, like saveDraft, persists) the active project
 * the same way the localStorage autosave does, so both transports agree on
 * which project a given save belongs to.
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

    // FINDING 1 guard: same frozen-project veto as saveDraft() — see
    // resolveActiveProjectKeyForWrite().
    const projectKey = resolveActiveProjectKeyForWrite(draft);
    if (projectKey === null) return;
    const meta = buildServerMeta(draft, projectKey, existingStatusOverrides(projectKey));
    if (viaBeacon) {
      // Unload path: fire-and-forget; assume it lands so we don't re-push.
      saveServerDraftBeacon(token, meta, draft, projectKey);
      lastPushedHash = hash;
    } else {
      void saveServerDraft(token, meta, draft, projectKey).then((ok) => {
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
