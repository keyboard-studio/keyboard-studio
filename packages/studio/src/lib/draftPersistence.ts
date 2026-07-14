// draftPersistence — durable localStorage draft so an in-progress authoring
// session survives a hard reload / tab reopen / OAuth redirect return.
//
// This module is the reload-survival counterpart to persistWorkingCopy.ts
// (which snapshots to sessionStorage across an OAuth redirect only). The
// durable draft persists BOTH the working copy AND the traversal state (the
// "where am I in the walk" position), keyed per-project so a future
// multi-project index (US3a / FR-014) is additive rather than a migration.
//
// See specs/034-mvp-authoring-walk/contracts/persistence.md (the UI contract)
// and specs/034-mvp-authoring-walk/data-model.md (the DurableDraft envelope).
//
// Article IV: installDraftAutosave's debounce is a SEPARATE lightweight timer,
// never the 300ms validator/WASM-oracle debounce cycle and never a second
// validation path — see the comment on installDraftAutosave below.

import {
  applyWorkingCopySnapshot,
  snapshotWorkingCopyData,
  type WorkingCopySnapshot,
} from "./persistWorkingCopy.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import type { WorkingCopyData } from "../stores/workingCopyStore.ts";
import {
  applyTraversalSnapshot,
  snapshotTraversal,
  useSurveySessionStore,
  type TraversalSnapshot,
} from "../stores/surveySessionStore.ts";

// ---------------------------------------------------------------------------
// Key scheme (T004) — per-project, versioned localStorage keys.
// ---------------------------------------------------------------------------

/**
 * localStorage key namespace for durable drafts. The full key for a project is
 * `${DRAFT_KEY_PREFIX}${projectKey}.v${DRAFT_VERSION}` (see draftKey). The
 * per-project namespace (not one global key) is what lets a future draft index
 * (`ks.draftIndex.v1`) enumerate drafts without a data migration (FR-014).
 */
export const DRAFT_KEY_PREFIX = "ks.draft." as const;

/**
 * Current draft envelope version. On boot, a draft whose stored version does
 * not equal this is discarded, not migrated (VR-1) — an MVP-appropriate policy
 * that prevents a stale-shape draft from rehydrating into a changed store.
 */
export const DRAFT_VERSION = 1 as const;

/**
 * The namespaced, versioned localStorage key for a project's durable draft.
 *
 * @param projectKey  A stable per-project id (derived from the working copy's
 *                    keyboard id at instantiation). The MVP only ever reads/
 *                    writes one such key at a time.
 * @returns e.g. `ks.draft.my_kbd.v1`.
 */
export function draftKey(projectKey: string): string {
  return `${DRAFT_KEY_PREFIX}${projectKey}.v${DRAFT_VERSION}`;
}

/**
 * localStorage key for the single "which project is active" pointer. Lets
 * boot resolve the one durable draft to load without a full index (G-3). A
 * future multi-project build (US3a) replaces this with a `ks.draftIndex.v1`
 * enumeration; this pointer is the one-project special case of that.
 */
const ACTIVE_PROJECT_KEY = "ks.draft.active" as const;

// ---------------------------------------------------------------------------
// DurableDraft envelope (data-model.md)
// ---------------------------------------------------------------------------

/**
 * The persisted record that lets an author resume across a reload.
 *
 * `workingCopy` and `traversal` are the two sub-entities defined in
 * data-model.md, reused verbatim from persistWorkingCopy.ts (working copy) and
 * surveySessionStore.ts (traversal) — see T017/T018.
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
}

// ---------------------------------------------------------------------------
// projectKey derivation
//
// "A stable per-project id derived from the working copy's keyboard id at
// instantiation" (data-model.md). `identity.keyboardId` is the authoritative
// source once set, but for Track 1 (instantiateFromBase) `identity` is reset
// to null immediately at instantiation and only gains `keyboardId` later (at
// the project_name step) — so `baseKeyboard.id` is the immediate fallback,
// available from the first instant of EITHER track's instantiation. Track 2
// (instantiateFromExisting) sets identity.keyboardId = keyboard.id right away,
// so both sources agree there.
// ---------------------------------------------------------------------------

/** Narrow slice of WorkingCopyData needed to derive the per-project key. */
export type ProjectKeySource = Pick<WorkingCopyData, "identity" | "baseKeyboard">;

/**
 * Derive the stable per-project key from working-copy state. Returns null
 * before any instantiation (both sources absent).
 */
export function deriveProjectKeyFromWorkingCopy(wc: ProjectKeySource): string | null {
  return wc.identity?.keyboardId ?? wc.baseKeyboard?.id ?? null;
}

// ---------------------------------------------------------------------------
// Active-project pointer
// ---------------------------------------------------------------------------

/**
 * Read the currently-active project key, or null if none is recorded (fresh
 * install, or cleared by start-over). Used at boot to resolve which draft to
 * load without an index (G-3).
 */
export function resolveActiveProjectKey(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY);
  } catch {
    // Security/quota restriction reading localStorage — treat as "no active project".
    return null;
  }
}

/**
 * Record `projectKey` as the active project. Called at draft-write time
 * (saveDraft) and at autosave-install time (installDraftAutosave) so the
 * pointer exists even before the first debounced save completes.
 */
export function setActiveProjectKey(projectKey: string): void {
  try {
    localStorage.setItem(ACTIVE_PROJECT_KEY, projectKey);
  } catch {
    // VR-4-equivalent: quota/security failure — never throw into the authoring flow.
  }
}

/**
 * Unconditionally clear the active-project pointer (start-over, research D5).
 * Clearing regardless of the current value is intentional: after start-over
 * there should be no active project, full stop.
 */
export function clearActiveProjectKey(): void {
  try {
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
  } catch {
    // VR-4: quota/security failure — never throw into the authoring flow.
  }
}

// ---------------------------------------------------------------------------
// save / load / clear (T018, T019, T020)
// ---------------------------------------------------------------------------

/**
 * Save the current working copy + traversal state as this project's durable
 * draft.
 *
 * Guard (VR-2): no-op when the working copy is not really instantiated
 * (`instantiationMode === null`) or has no working IR yet (`ir === null`) — a
 * guest who has not picked a keyboard has nothing worth persisting.
 *
 * Wraps the localStorage write in try/catch (VR-4): a quota/security failure
 * is skipped silently so the authoring flow never throws; worst case a reload
 * loses the most recent edits, never a crash.
 */
export function saveDraft(projectKey: string): void {
  const wc = useWorkingCopyStore.getState();
  if (wc.instantiationMode === null || wc.ir === null) {
    return; // VR-2
  }

  const session = useSurveySessionStore.getState();

  // displayName: Track-1 scaffoldSpec (project_name step) first, then the
  // identity patch's displayName (Track 2 / post-Phase-A Track 1), then the
  // base keyboard's own display name as a last resort.
  const displayName =
    session.scaffoldSpec?.displayName ??
    wc.identity?.displayName ??
    wc.baseKeyboard?.displayName ??
    null;

  // languageTag: identity-lite's computed BCP47 tag first (may be "" if the
  // step hasn't completed or the language subtag was left blank — normalize
  // that to null), then the identity patch's own bcp47 field.
  const rawLanguageTag = session.identityResult?.bcp47 ?? wc.identity?.bcp47 ?? null;
  const languageTag = rawLanguageTag !== null && rawLanguageTag !== "" ? rawLanguageTag : null;

  const envelope: DurableDraft = {
    version: DRAFT_VERSION,
    savedAt: Date.now(),
    projectKey,
    displayName,
    languageTag,
    workingCopy: snapshotWorkingCopyData(),
    traversal: snapshotTraversal(),
  };

  try {
    localStorage.setItem(draftKey(projectKey), JSON.stringify(envelope));
    setActiveProjectKey(projectKey);
  } catch {
    // VR-4: quota/security failure — skip silently, author keeps working.
  }
}

/**
 * Whether `loadDraft()` successfully restored a draft THIS page boot.
 *
 * `main.tsx` calls `loadDraft()` exactly once, before React mounts, so this
 * flag is set (if at all) before any component ever renders — including
 * before StrictMode's double-invoked mount effects, which therefore both see
 * the same stable value (deviation 2, research D4).
 */
let _draftRestoredThisBoot = false;

/** Reader for the module-level "restored this boot" flag — see above. */
export function wasDraftRestoredThisBoot(): boolean {
  return _draftRestoredThisBoot;
}

/**
 * Load `projectKey`'s durable draft (if any) and rehydrate both stores.
 *
 * - Returns false if no draft is stored under this key.
 * - VR-3: a malformed/unparseable draft is removed and treated as absent.
 * - VR-1: a version mismatch is removed and treated as absent (discard, not
 *   migrate).
 * - VR-2: a draft with no real instantiation is treated as absent (left in
 *   place — not removed; nothing to migrate away from).
 * - G-1/G-5: on success, patches the SAME single working-copy store and the
 *   SAME single survey-session store — never constructs a second working
 *   copy — then returns true so the caller can resume at
 *   `traversal.activeStepId`.
 */
export function loadDraft(projectKey: string): boolean {
  let raw: string | null;
  try {
    raw = localStorage.getItem(draftKey(projectKey));
  } catch {
    return false;
  }
  if (raw === null) return false;

  // VR-3 (P0 fix): the ENTIRE parse-through-apply body is one try/catch, not
  // just the JSON.parse call. A record can be valid JSON but wrong-shaped
  // (e.g. `{"version":1}` with `workingCopy` missing/null, or a non-object
  // value), or `applyWorkingCopySnapshot` can throw deep inside
  // `deserializeEntry`'s `atob()` on a corrupt Base64 VFS entry. Any of these
  // must be treated exactly like an unparseable draft — clear + treat as
  // absent — never thrown into `main.tsx`'s pre-mount, unguarded call.
  try {
    const envelope = JSON.parse(raw) as DurableDraft;

    if (envelope.version !== DRAFT_VERSION) {
      // VR-1: version mismatch — discard, do not attempt to migrate.
      clearDraft(projectKey);
      return false;
    }

    if (
      envelope.workingCopy === null ||
      typeof envelope.workingCopy !== "object" ||
      envelope.workingCopy.instantiationMode === null
    ) {
      // VR-2: "no real work" (or the field is missing/wrong-shaped) — ignored
      // (not removed; mirrors the sessionStorage snapshot guard's semantics
      // of "nothing worth restoring").
      return false;
    }

    applyWorkingCopySnapshot(envelope.workingCopy);
    applyTraversalSnapshot(envelope.traversal);

    _draftRestoredThisBoot = true;
    return true;
  } catch {
    // VR-3: malformed/wrong-shaped/corrupt — remove and treat as absent so it
    // doesn't loop or crash boot.
    clearDraft(projectKey);
    return false;
  }
}

/**
 * Remove `projectKey`'s durable draft. Does NOT touch the active-project
 * pointer — callers that also want the pointer cleared (start-over) call
 * `clearActiveProjectKey()` alongside this (see StudioShell.handleStartOver
 * and WelcomeScreen's "I'm new" entry point), so the two concerns stay
 * independently callable per the persistence contract.
 */
export function clearDraft(projectKey: string): void {
  try {
    localStorage.removeItem(draftKey(projectKey));
  } catch {
    // VR-4: quota/security failure — never throw into the authoring flow.
  }
}

/**
 * VR-5 single-project MVP guard (FR-009 / US3 AS-4): instantiating a working
 * copy under a DIFFERENT projectKey than the currently-active one must be
 * well-defined — replace, never silently merge two projects' state into one
 * record.
 *
 * For the MVP this is a clean REPLACE (no confirmation prompt): the prior
 * project's draft is cleared outright. Call this BEFORE the new
 * instantiation's own autosave starts writing under `newProjectKey` (see
 * StudioShell's onInstantiate). The active pointer is left untouched here —
 * the new project's own saveDraft/installDraftAutosave call repoints it to
 * `newProjectKey` immediately after.
 */
export function replaceActiveDraftIfDifferentProject(newProjectKey: string): void {
  const prevKey = resolveActiveProjectKey();
  if (prevKey !== null && prevKey !== newProjectKey) {
    clearDraft(prevKey);
  }
}

/**
 * Discard the currently-active project's persisted draft entirely: clears
 * the project-scoped draft record (if the active pointer resolves to one)
 * and unconditionally clears the active-project pointer itself.
 *
 * Extracted (P2 synthesis) from two identical inline call sites —
 * WelcomeScreen's "I'm new" entry point and StudioShell's
 * `handleStartOver` — so the "resolve active projectKey -> clearDraft ->
 * clearActiveProjectKey" sequence is written once. Resolves the target via
 * `resolveActiveProjectKey()` rather than requiring the caller to derive it,
 * so every caller discards the SAME draft the active pointer names.
 */
export function discardActiveDraft(): void {
  const projectKey = resolveActiveProjectKey();
  if (projectKey !== null) {
    clearDraft(projectKey);
  }
  clearActiveProjectKey();
}

// ---------------------------------------------------------------------------
// installDraftAutosave (T021)
// ---------------------------------------------------------------------------

/** Debounce window for the autosave write — see the Article IV note below. */
const AUTOSAVE_DEBOUNCE_MS = 500;

/**
 * Subscribe to BOTH the working-copy store and the survey-session store; on
 * any change, debounce ~500ms then write this project's durable draft.
 *
 * Article IV (critical): this debounce timer is an INDEPENDENT, lightweight
 * `setTimeout` — it is NOT the 300ms validator/WASM-oracle debounce cycle
 * (owned by useValidator/km-validator's single-cycle contract) and it starts
 * no second validation path. It only decides when to persist the two stores'
 * already-computed state to localStorage. Do not fold this into the validator
 * debounce, and do not add a THIRD timer alongside it for some other concern
 * without going through km-validator first.
 *
 * Returns a teardown function that unsubscribes both stores and clears any
 * pending timer. Call it on app unmount (and before installing a new autosave
 * for a different project).
 *
 * P1 fix (G-1 gap): performs ONE synchronous `saveDraft(projectKey)` here, at
 * install time — not just the active-pointer write — so a draft RECORD exists
 * immediately at instantiation, before the first debounced store mutation.
 * Without this, a reload in the window between "instantiation succeeded" and
 * "the author's first edit" found only the active pointer and no draft
 * record, so `loadDraft` returned false and the just-instantiated project was
 * silently discarded on reload. `saveDraft`'s own VR-2 guard still applies
 * (no-ops if the working copy is somehow not yet instantiated), so this is
 * safe to call unconditionally.
 */
export function installDraftAutosave(projectKey: string): () => void {
  // Record the active project immediately — a reload before the first
  // debounced save still resolves the correct draft on next boot.
  setActiveProjectKey(projectKey);

  // Synchronous initial save (P1 fix) — see the doc comment above.
  saveDraft(projectKey);

  let timer: ReturnType<typeof setTimeout> | null = null;

  const scheduleSave = () => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      saveDraft(projectKey);
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  const unsubscribeWorkingCopy = useWorkingCopyStore.subscribe(scheduleSave);
  const unsubscribeSurveySession = useSurveySessionStore.subscribe(scheduleSave);

  return () => {
    unsubscribeWorkingCopy();
    unsubscribeSurveySession();
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

// ---------------------------------------------------------------------------
// Forward-compat only (NOT built in the MVP — see contracts/persistence.md
// "Non-goals"). `resolveActiveProjectKey` above IS the MVP single-project
// facade; a future `listDrafts(): DraftSummary[]` would read a
// `ks.draftIndex.v1` enumeration instead. Not implemented here.
// ---------------------------------------------------------------------------
